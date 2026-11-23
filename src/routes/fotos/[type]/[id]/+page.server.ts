import { error, fail } from '@sveltejs/kit';
import {
	ALBUM_TYPES,
	albumKey,
	CAPTION_MAX,
	cleanText,
	clockSeconds,
	COMMENT_MAX,
	formatBytes,
	imageType,
	mayRemoveComment,
	mayRemovePhoto,
	PENDING_PER_MEMBER,
	PHOTO_MAX_BYTES,
	PHOTOS_PER_DAY,
	PHOTOS_PER_UPLOAD,
	THUMB_MAX_BYTES,
	TITLE_MAX,
	videoLink,
	visiblePhotos,
	type AlbumType,
	type VideoPiece
} from '#lib/album/album.ts';
import { config } from '#lib/config/index.ts';
import * as t from '#lib/i18n/texts.ts';
import { albumPieces, albumStorage, albumViewer, checkUpload, resolveAlbum, storageUse } from '#lib/server/album.ts';
import { requireFeature } from '#lib/server/env.ts';
import type { Actions, PageServerLoad } from './$types';

const typeOf = (value: string): AlbumType => {
	if (!ALBUM_TYPES.includes(value as AlbumType)) error(404, t.error.notFound);
	return value as AlbumType;
};

const stamp = (iso: string) => new Intl.DateTimeFormat(config.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: config.timeZone }).format(new Date(iso));

/** One album (#66): its photos, adding more once the date has begun, and what members say about it. */
export const load: PageServerLoad = async ({ locals, params }) => {
	requireFeature('album');
	const type = typeOf(params.type);
	const viewer = await albumViewer(locals);
	if (!viewer) error(403, t.album.membersOnly);
	const storage = await albumStorage();
	if (!storage) return { state: 'not-set-up' as const };
	const album = await resolveAlbum(type, params.id, storage.store);
	if (!album) error(404, t.error.notFound);
	const [photos, videos, comments, pieces] = await Promise.all([
		storage.store.photos({ album: album.album }),
		storage.store.videos({ album: album.album }),
		storage.store.comments(album.album),
		album.open ? albumPieces(album) : []
	]);
	return {
		state: 'ready' as const,
		album: { type, title: album.title, kind: album.kind, when: album.when, open: album.open, back: album.back },
		approves: viewer.approves,
		photos: visiblePhotos(photos, viewer).map((photo) => ({
			id: photo.id,
			caption: photo.caption,
			width: photo.width,
			height: photo.height,
			by: photo.name,
			pending: photo.status === 'pending',
			public: photo.public,
			mayRemove: mayRemovePhoto(photo, viewer)
		})),
		// Recordings (#408): unlisted YouTube videos, with the programme's pieces to mark in them.
		videos: visiblePhotos(videos, viewer).map((video) => ({
			id: video.id,
			youtube: video.youtube,
			start: video.start,
			title: video.title,
			by: video.name,
			pending: video.status === 'pending',
			pieces: video.pieces,
			mayRemove: mayRemovePhoto(video, viewer)
		})),
		pieces,
		comments: comments.map((comment) => ({ id: comment.id, name: comment.name, text: comment.text, when: stamp(comment.createdAt), mayRemove: mayRemoveComment(comment, viewer) }))
	};
};

/** The viewer, the storage and the album, for every action; null with the answer when one is missing. */
async function context(locals: App.Locals, params: { type: string; id: string }) {
	const viewer = await albumViewer(locals);
	if (!viewer) error(403, t.album.membersOnly);
	const storage = await albumStorage();
	if (!storage) return { problem: fail(503, { message: t.album.notSetUp }) };
	const album = await resolveAlbum(typeOf(params.type), params.id, storage.store);
	if (!album) return { problem: fail(404, { message: t.album.problems.gone }) };
	return { viewer, storage, album };
}

/** "1600,1067" → the photo's size; null for anything else. */
function sizeOf(value: FormDataEntryValue | undefined): { width: number; height: number } | null {
	const match = typeof value === 'string' ? /^(\d{1,5}),(\d{1,5})$/.exec(value) : null;
	if (!match) return null;
	const [width, height] = [Number(match[1]), Number(match[2])];
	return width > 0 && height > 0 && width <= 10_000 && height <= 10_000 ? { width, height } : null;
}

export const actions: Actions = {
	/**
	 * Photos the browser made smaller (resize.ts): each one as "photo", "thumb" and "size", in the
	 * same order. Checked by their bytes, not by what the browser called them. They wait for
	 * approval, unless the one uploading approves photos themself.
	 */
	upload: async ({ request, locals, params }) => {
		const found = await context(locals, params);
		if ('problem' in found) return found.problem;
		const { viewer, storage, album } = found;
		if (!album.open) return fail(400, { message: t.album.problems.notOpen });
		const data = await request.formData();
		const fulls = data.getAll('photo');
		const thumbs = data.getAll('thumb');
		const sizes = data.getAll('size');
		if (!fulls.length) return fail(400, { message: t.album.problems.noFiles });
		if (fulls.length > PHOTOS_PER_UPLOAD) return fail(400, { message: t.album.problems.tooMany(PHOTOS_PER_UPLOAD) });
		if (thumbs.length !== fulls.length || sizes.length !== fulls.length) return fail(400, { message: t.album.problems.badFile });
		const captionText = String(data.get('caption') ?? '').trim();
		const caption = captionText ? cleanText(captionText, CAPTION_MAX) : undefined;
		if (caption === null) return fail(400, { message: t.album.problems.caption(CAPTION_MAX) });

		const photos: { full: Uint8Array; thumb: Uint8Array; fullType: string; thumbType: string; width: number; height: number }[] = [];
		for (const [i, full] of fulls.entries()) {
			const thumb = thumbs[i];
			const size = sizeOf(sizes[i]);
			if (!(full instanceof File) || !(thumb instanceof File) || !size || !full.size || !thumb.size || full.size > PHOTO_MAX_BYTES || thumb.size > THUMB_MAX_BYTES) {
				return fail(400, { message: t.album.problems.badFile });
			}
			const [fullBytes, thumbBytes] = [new Uint8Array(await full.arrayBuffer()), new Uint8Array(await thumb.arrayBuffer())];
			const [fullType, thumbType] = [imageType(fullBytes), imageType(thumbBytes)];
			if (!fullType || !thumbType) return fail(400, { message: t.album.problems.badFile });
			photos.push({ full: fullBytes, thumb: thumbBytes, fullType, thumbType, ...size });
		}

		// R2 stays in its free tier (#408): the storage budget, and how much one person may add.
		const bytes = photos.reduce((sum, photo) => sum + photo.full.length + photo.thumb.length, 0);
		const refusal = await checkUpload(storage.store, viewer, { count: photos.length, bytes });
		if (refusal === 'full') return fail(507, { message: t.album.problems.full(formatBytes((await storageUse(storage.store)).budget, config.locale)) });
		if (refusal === 'daily') return fail(429, { message: t.album.problems.daily(PHOTOS_PER_DAY) });
		if (refusal === 'waiting') return fail(429, { message: t.album.problems.waiting(PENDING_PER_MEMBER) });

		let saved = 0;
		try {
			for (const photo of photos) {
				const record = await storage.store.addPhoto({
					album: album.album,
					kind: album.kind,
					title: album.title,
					day: album.day,
					email: viewer.email,
					name: viewer.name,
					width: photo.width,
					height: photo.height,
					type: photo.fullType,
					bytes: photo.full.length + photo.thumb.length,
					...(caption ? { caption } : {})
				});
				try {
					await storage.files.put(record.id, 'full', photo.full, photo.fullType);
					await storage.files.put(record.id, 'thumb', photo.thumb, photo.thumbType);
				} catch (cause) {
					// No record without its image.
					await storage.store.removePhoto(record.id).catch(() => {});
					await storage.files.remove(record.id).catch(() => {});
					throw cause;
				}
				if (viewer.approves) await storage.store.approve(record.id, false, viewer.email);
				saved++;
			}
		} catch (cause) {
			console.error('Uploading photos failed:', cause);
			if (!saved) return fail(503, { message: t.album.problems.failed });
		}
		return { uploaded: saved, approved: viewer.approves };
	},

	/**
	 * A recording (#408): an unlisted YouTube link, its title, and where the programme's pieces
	 * start in it ("start-<pieceId>"). It waits for approval like a photo.
	 */
	addVideo: async ({ request, locals, params }) => {
		const found = await context(locals, params);
		if ('problem' in found) return found.problem;
		const { viewer, storage, album } = found;
		if (!album.open) return fail(400, { message: t.album.problems.notOpen });
		const data = await request.formData();
		const values = Object.fromEntries([...data.entries()].filter(([, value]) => typeof value === 'string').map(([key, value]) => [key, String(value)]));
		const link = videoLink(values.link ?? '');
		if (!link) return fail(400, { message: t.album.problems.badLink, video: values });
		const title = cleanText(values.title, TITLE_MAX);
		if (!title || title.includes('\n')) return fail(400, { message: t.album.problems.videoTitle(TITLE_MAX), video: values });
		const pieces: VideoPiece[] = [];
		for (const piece of await albumPieces(album)) {
			const text = values[`start-${piece.pieceId}`] ?? '';
			const start = clockSeconds(text);
			if (start === null) return fail(400, { message: t.album.problems.badStart(piece.title), video: values });
			if (start !== undefined) pieces.push({ ...piece, ...(start ? { start } : {}) });
		}
		try {
			const video = await storage.store.addVideo({
				album: album.album,
				kind: album.kind,
				albumTitle: album.title,
				day: album.day,
				title,
				youtube: link.youtube,
				...(link.start ? { start: link.start } : {}),
				email: viewer.email,
				name: viewer.name,
				pieces
			});
			if (viewer.approves) await storage.store.approveVideo(video.id, viewer.email);
		} catch (cause) {
			console.error('Saving a recording failed:', cause);
			return fail(503, { message: t.album.problems.failed, video: values });
		}
		return { videoAdded: true, approved: viewer.approves };
	},

	removeVideo: async ({ request, locals, params }) => {
		const found = await context(locals, params);
		if ('problem' in found) return found.problem;
		const id = String((await request.formData()).get('id') ?? '');
		const video = await found.storage.store.video(id);
		if (!video || video.album !== found.album.album) return fail(404, { message: t.album.problems.gone });
		if (!mayRemovePhoto(video, found.viewer)) return fail(403, { message: t.album.problems.notYours });
		await found.storage.store.removeVideo(id);
		return { videoRemoved: true };
	},

	comment: async ({ request, locals, params }) => {
		const found = await context(locals, params);
		if ('problem' in found) return found.problem;
		const data = await request.formData();
		const text = cleanText(data.get('text'), COMMENT_MAX);
		if (!text) return fail(400, { message: t.album.problems.comment(COMMENT_MAX), text: String(data.get('text') ?? '') });
		try {
			await found.storage.store.addComment({ album: found.album.album, email: found.viewer.email, name: found.viewer.name, text });
		} catch (cause) {
			console.error('Saving a comment failed:', cause);
			return fail(503, { message: t.album.problems.failed, text });
		}
		return { commented: true };
	},

	removePhoto: async ({ request, locals, params }) => {
		const found = await context(locals, params);
		if ('problem' in found) return found.problem;
		const id = String((await request.formData()).get('id') ?? '');
		const photo = await found.storage.store.photo(id);
		if (!photo || photo.album !== albumKey(found.album.type, found.album.id)) return fail(404, { message: t.album.problems.gone });
		if (!mayRemovePhoto(photo, found.viewer)) return fail(403, { message: t.album.problems.notYours });
		try {
			await found.storage.store.removePhoto(id);
			await found.storage.files.remove(id);
		} catch (cause) {
			console.error('Removing a photo failed:', cause);
			return fail(503, { message: t.album.problems.failed });
		}
		return { removed: true };
	},

	removeComment: async ({ request, locals, params }) => {
		const found = await context(locals, params);
		if ('problem' in found) return found.problem;
		const id = String((await request.formData()).get('id') ?? '');
		const comment = await found.storage.store.comment(id);
		if (!comment || comment.album !== found.album.album) return fail(404, { message: t.album.problems.gone });
		if (!mayRemoveComment(comment, found.viewer)) return fail(403, { message: t.album.problems.notYours });
		await found.storage.store.removeComment(id);
		return { commentRemoved: true };
	}
};
