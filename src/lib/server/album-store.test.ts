import { describe, expect, it } from 'vitest';
import type { NewAlbumPhoto } from '#lib/album/album.ts';
import { MemoryAlbumStore, MemoryPhotoFiles, R2PhotoFiles, SqlAlbumStore, type AlbumStore, type R2Like } from './album-store.ts';
import { localD1 } from './db/local-d1.ts';

const upload = (album: string, day: string, email = 'mia@example.org', extra: Partial<NewAlbumPhoto> = {}): NewAlbumPhoto => ({
	album,
	kind: 'konzert',
	title: 'Herbstkonzert',
	day,
	email,
	name: 'Mia Beispiel',
	width: 1600,
	height: 1067,
	type: 'image/jpeg',
	bytes: 500_000,
	...extra
});

for (const [name, make] of [
	['SqlAlbumStore (SQLite)', () => new SqlAlbumStore(localD1())],
	['MemoryAlbumStore', () => new MemoryAlbumStore()]
] as [string, () => AlbumStore][]) {
	describe(name, () => {
		it('keeps an upload waiting until it is approved, and public only when chosen', async () => {
			const store = make();
			const added = await store.addPhoto(upload('termin:herbst', '2026-11-14', 'mia@example.org', { caption: 'Schlussapplaus' }), '2026-11-15T10:00:00Z');
			expect(added).toMatchObject({ album: 'termin:herbst', status: 'pending', public: false, caption: 'Schlussapplaus', width: 1600, createdAt: '2026-11-15T10:00:00Z' });
			expect(added.id).toMatch(/^[0-9a-f]{32}$/);
			expect(await store.pendingCount()).toBe(1);
			expect(await store.photos({ status: 'approved' })).toEqual([]);

			expect(await store.approve(added.id, false, 'vera@example.org')).toBe(true);
			expect(await store.photo(added.id)).toMatchObject({ status: 'approved', public: false, approvedBy: 'vera@example.org' });
			expect(await store.photos({ status: 'approved', public: true })).toEqual([]);
			await store.approve(added.id, true, 'paul@example.org');
			// Whoever approved first stays on record.
			expect(await store.photo(added.id)).toMatchObject({ public: true, approvedBy: 'vera@example.org' });
			expect((await store.photos({ status: 'approved', public: true })).map((p) => p.id)).toEqual([added.id]);
			expect(await store.pendingCount()).toBe(0);

			expect(await store.approve('missing', true, 'vera@example.org')).toBe(false);
			expect(await store.removePhoto(added.id)).toBe(true);
			expect(await store.removePhoto(added.id)).toBe(false);
		});

		it('lists photos newest album first, in upload order within an album, and by album or person', async () => {
			const store = make();
			const old = await store.addPhoto(upload('album:fest', '1975-06'), '2026-11-01T10:00:00Z');
			const second = await store.addPhoto(upload('termin:herbst', '2026-11-14', 'paul@example.org'), '2026-11-15T11:00:00Z');
			const first = await store.addPhoto(upload('termin:herbst', '2026-11-14'), '2026-11-15T10:00:00Z');
			expect((await store.photos()).map((p) => p.id)).toEqual([first.id, second.id, old.id]);
			expect((await store.photos({ album: 'album:fest' })).map((p) => p.id)).toEqual([old.id]);
			expect((await store.photos({ email: 'paul@example.org' })).map((p) => p.id)).toEqual([second.id]);
		});

		it('adds up what R2 holds, and counts one person’s uploads of the last day and those waiting (#408)', async () => {
			const store = make();
			expect(await store.storedBytes()).toBe(0);
			const old = await store.addPhoto(upload('termin:a', '2026-11-14', 'mia@example.org', { bytes: 300 }), '2026-11-20T10:00:00Z');
			await store.addPhoto(upload('termin:a', '2026-11-14', 'mia@example.org', { bytes: 200 }), '2026-11-23T09:00:00Z');
			await store.addPhoto(upload('termin:a', '2026-11-14', 'paul@example.org', { bytes: 100 }), '2026-11-23T09:00:00Z');
			await store.approve(old.id, false, 'vera@example.org');
			expect(await store.storedBytes()).toBe(600);
			expect(await store.uploadsOf('mia@example.org', '2026-11-22T12:00:00Z')).toEqual({ since: 1, waiting: 1 });
			expect(await store.uploadsOf('nobody@example.org', '2026-11-22T12:00:00Z')).toEqual({ since: 0, waiting: 0 });
		});

		it('keeps recordings waiting until approved, with their pieces and start times (#408)', async () => {
			const store = make();
			const video = await store.addVideo(
				{
					album: 'termin:herbst',
					kind: 'konzert',
					albumTitle: 'Herbstkonzert',
					day: '2026-11-14',
					title: 'Mitschnitt',
					youtube: 'aqz-KE-bpKQ',
					start: 12,
					email: 'mia@example.org',
					name: 'Mia',
					pieces: [{ pieceId: 'p1', title: 'Ouvertüre' }, { pieceId: 'p2', title: 'Sinfonie', start: 600 }]
				},
				'2026-11-15T10:00:00Z'
			);
			expect(video).toMatchObject({ status: 'pending', albumTitle: 'Herbstkonzert', title: 'Mitschnitt', youtube: 'aqz-KE-bpKQ', start: 12, createdAt: '2026-11-15T10:00:00Z' });
			expect(video.pieces).toEqual([{ pieceId: 'p1', title: 'Ouvertüre' }, { pieceId: 'p2', title: 'Sinfonie', start: 600 }]);
			expect(await store.pendingCount()).toBe(1);
			expect(await store.videos({ status: 'approved' })).toEqual([]);
			expect(await store.approveVideo(video.id, 'vera@example.org')).toBe(true);
			expect(await store.video(video.id)).toMatchObject({ status: 'approved', approvedBy: 'vera@example.org' });
			expect((await store.videos({ album: 'termin:herbst' })).map((v) => v.id)).toEqual([video.id]);
			expect(await store.countBy('mia@example.org')).toBe(1);
			await store.forget('mia@example.org', { email: 'x@invalid', name: 'Gelöscht' });
			expect(await store.video(video.id)).toMatchObject({ email: 'x@invalid', name: 'Gelöscht' });
			expect(await store.removeVideo(video.id)).toBe(true);
			expect(await store.removeVideo(video.id)).toBe(false);
		});

		it('keeps comments per album in the order they were written', async () => {
			const store = make();
			const later = await store.addComment({ album: 'termin:herbst', email: 'paul@example.org', name: 'Paul', text: 'Danke!' }, '2026-11-15T12:00:00Z');
			const earlier = await store.addComment({ album: 'termin:herbst', email: 'mia@example.org', name: 'Mia', text: 'Was für ein Abend.' }, '2026-11-15T11:00:00Z');
			await store.addComment({ album: 'fahrt:rom', email: 'mia@example.org', name: 'Mia', text: 'Ciao' }, '2026-11-16T11:00:00Z');
			expect((await store.comments('termin:herbst')).map((c) => c.id)).toEqual([earlier.id, later.id]);
			expect((await store.commentsBy('mia@example.org')).map((c) => c.album)).toEqual(['termin:herbst', 'fahrt:rom']);
			expect(await store.commentCounts()).toEqual(new Map([['termin:herbst', 2], ['fahrt:rom', 1]]));
			expect(await store.comment(later.id)).toMatchObject({ text: 'Danke!' });
			expect(await store.removeComment(later.id)).toBe(true);
			expect(await store.removeComment(later.id)).toBe(false);
		});

		it('keeps albums of their own, newest first', async () => {
			const store = make();
			const party = await store.addOwnAlbum({ title: 'Sommerfest', day: '1975-06', email: 'vera@example.org' }, '2026-11-01T10:00:00Z');
			await store.addOwnAlbum({ title: 'Gründung', day: '1969', email: 'vera@example.org' });
			expect((await store.ownAlbums()).map((a) => a.title)).toEqual(['Sommerfest', 'Gründung']);
			expect(await store.ownAlbum(party.id)).toEqual({ id: party.id, title: 'Sommerfest', day: '1975-06', email: 'vera@example.org', createdAt: '2026-11-01T10:00:00Z' });
			expect(await store.ownAlbum('nope')).toBeNull();
		});

		it('on deletion keeps a member’s photos under a pseudonym and removes their comments', async () => {
			const store = make();
			const kept = await store.addPhoto(upload('termin:herbst', '2026-11-14'));
			await store.addComment({ album: 'termin:herbst', email: 'mia@example.org', name: 'Mia', text: 'Schön!' });
			await store.addComment({ album: 'termin:herbst', email: 'paul@example.org', name: 'Paul', text: 'Ja!' });
			await store.addOwnAlbum({ title: 'Sommerfest', day: '1975', email: 'mia@example.org' });
			expect(await store.countBy('mia@example.org')).toBe(2);

			await store.forget('mia@example.org', { email: 'geloescht-1@invalid', name: 'Gelöschtes Mitglied' });
			expect(await store.photo(kept.id)).toMatchObject({ email: 'geloescht-1@invalid', name: 'Gelöschtes Mitglied' });
			expect((await store.comments('termin:herbst')).map((c) => c.name)).toEqual(['Paul']);
			expect((await store.ownAlbums())[0].email).toBe('geloescht-1@invalid');
			expect(await store.countBy('mia@example.org')).toBe(0);
		});
	});
}

describe('photo files', () => {
	it('keeps both sizes per photo in memory and removes them together', async () => {
		const files = new MemoryPhotoFiles();
		await files.put('p1', 'full', new Uint8Array([1, 2, 3]), 'image/jpeg');
		await files.put('p1', 'thumb', new Uint8Array([4]), 'image/jpeg');
		expect(await files.get('p1', 'full')).toEqual({ body: new Uint8Array([1, 2, 3]), type: 'image/jpeg' });
		await files.remove('p1');
		expect(await files.get('p1', 'full')).toBeNull();
		expect(await files.get('p1', 'thumb')).toBeNull();
	});

	it('names R2 objects by photo and size, with their type', async () => {
		const calls: unknown[][] = [];
		const bucket: R2Like = {
			put: async (...args) => void calls.push(['put', ...args]),
			get: async (key) => (key === 'fotos/p1/thumb' ? { body: new ReadableStream(), httpMetadata: { contentType: 'image/webp' }, httpEtag: '"e"' } : null),
			delete: async (keys) => void calls.push(['delete', keys])
		};
		const files = new R2PhotoFiles(bucket);
		await files.put('p1', 'full', new Uint8Array([1]), 'image/jpeg');
		expect(calls[0]).toEqual(['put', 'fotos/p1/full', new Uint8Array([1]), { httpMetadata: { contentType: 'image/jpeg' } }]);
		expect(await files.get('p1', 'thumb')).toMatchObject({ type: 'image/webp', etag: '"e"' });
		expect(await files.get('p1', 'full')).toBeNull();
		await files.remove('p1');
		expect(calls[1]).toEqual(['delete', ['fotos/p1/full', 'fotos/p1/thumb']]);
	});
});
