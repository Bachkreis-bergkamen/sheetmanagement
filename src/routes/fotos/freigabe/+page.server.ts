import { fail } from '@sveltejs/kit';
import { albumHref, formatBytes, watchUrl } from '#lib/album/album.ts';
import { config } from '#lib/config/index.ts';
import * as t from '#lib/i18n/texts.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { ALBUM_RIGHT, albumStorage, consentGaps, resolveAlbumKey, storageUse } from '#lib/server/album.ts';
import { requireFeature } from '#lib/server/env.ts';
import type { Actions, PageServerLoad } from './$types';

const stamp = (iso: string) => new Intl.DateTimeFormat(config.locale, { day: 'numeric', month: 'short', timeZone: config.timeZone }).format(new Date(iso));

/**
 * The photos waiting for approval (#66), by album. For a calendar date the players without a
 * photo consent are named, so nobody puts them on the website by mistake.
 */
export const load: PageServerLoad = async ({ locals }) => {
	requireFeature('album');
	requireRight(locals, ALBUM_RIGHT);
	const storage = await albumStorage();
	if (!storage) return { state: 'not-set-up' as const };
	const [pending, films, use] = await Promise.all([storage.store.photos({ status: 'pending' }), storage.store.videos({ status: 'pending' }), storageUse(storage.store)]);
	const keys = [...new Set([...pending.map((photo) => photo.album), ...films.map((video) => video.album)])];
	const albums = await Promise.all(
		keys.map(async (key) => {
			const album = await resolveAlbumKey(key, storage.store);
			const photo = pending.find((one) => one.album === key);
			const video = films.find((one) => one.album === key);
			return {
				key,
				href: albumHref(key),
				title: album?.title ?? photo?.title ?? video!.albumTitle,
				when: album?.when ?? '',
				kind: album?.kind ?? photo?.kind ?? video!.kind,
				notShown: album ? await consentGaps(album).catch(() => null) : null,
				photos: pending
					.filter((photo) => photo.album === key)
					.map((photo) => ({ id: photo.id, caption: photo.caption, by: t.album.approval.uploaded(photo.name, stamp(photo.createdAt)) })),
				videos: films
					.filter((video) => video.album === key)
					.map((video) => ({ id: video.id, title: video.title, link: watchUrl(video.youtube, video.start), pieces: video.pieces.map((piece) => piece.title), by: t.album.approval.uploaded(video.name, stamp(video.createdAt)) }))
			};
		})
	);
	// What R2 holds against the budget, so the Leitung sees it coming before uploads stop (#408).
	return { state: 'ready' as const, albums, storage: { used: formatBytes(use.stored, config.locale), budget: formatBytes(use.budget, config.locale), share: Math.min(1, use.stored / use.budget) } };
};

export const actions: Actions = {
	/** Approves a waiting photo, or changes whether an approved one is on the website ("public"). */
	approve: async ({ request, locals }) => {
		requireRight(locals, ALBUM_RIGHT);
		const storage = await albumStorage();
		if (!storage) return fail(503, { message: t.album.notSetUp });
		const data = await request.formData();
		const ok = await storage.store.approve(String(data.get('id') ?? ''), data.get('public') === '1', locals.access.user?.email ?? '');
		return ok ? { approved: true } : fail(404, { message: t.album.problems.gone });
	},

	approveVideo: async ({ request, locals }) => {
		requireRight(locals, ALBUM_RIGHT);
		const storage = await albumStorage();
		if (!storage) return fail(503, { message: t.album.notSetUp });
		const ok = await storage.store.approveVideo(String((await request.formData()).get('id') ?? ''), locals.access.user?.email ?? '');
		return ok ? { approved: true } : fail(404, { message: t.album.problems.gone });
	},

	/** Rejects a recording: it leaves the album; the video on YouTube stays. */
	rejectVideo: async ({ request, locals }) => {
		requireRight(locals, ALBUM_RIGHT);
		const storage = await albumStorage();
		if (!storage) return fail(503, { message: t.album.notSetUp });
		const ok = await storage.store.removeVideo(String((await request.formData()).get('id') ?? ''));
		return ok ? { rejected: true } : fail(404, { message: t.album.problems.gone });
	},

	/** Rejects a photo: it's deleted with its images. */
	reject: async ({ request, locals }) => {
		requireRight(locals, ALBUM_RIGHT);
		const storage = await albumStorage();
		if (!storage) return fail(503, { message: t.album.notSetUp });
		const id = String((await request.formData()).get('id') ?? '');
		if (!(await storage.store.removePhoto(id))) return fail(404, { message: t.album.problems.gone });
		await storage.files.remove(id).catch((cause) => console.error('Deleting a rejected photo’s images failed:', cause));
		return { rejected: true };
	}
};
