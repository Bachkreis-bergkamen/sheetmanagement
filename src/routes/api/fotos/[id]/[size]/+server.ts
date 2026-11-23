import { error } from '@sveltejs/kit';
import { visiblePhotos } from '#lib/album/album.ts';
import { albumStorage, albumViewer } from '#lib/server/album.ts';
import { runInBackground } from '#lib/server/env.ts';
import * as t from '#lib/i18n/texts.ts';
import type { RequestHandler } from './$types';

const SIZES = { klein: 'thumb', gross: 'full' } as const;

/** The Workers cache of this data centre; none in development, where every image comes from the store. */
const edgeCache = () => (globalThis as { caches?: { default?: Cache } }).caches?.default;

/**
 * One photo of the album (#66), "klein" (the thumbnail) or "gross". A photo approved for the
 * website is open to anyone, so the website can show it; every other one only to members who
 * see it in the album. Anything else answers 404, so nobody learns which ids exist.
 *
 * Every image is read from R2 once per data centre and day and then from Cloudflare's cache
 * (#408): R2 is free up to ten million reads a month, and an album opened by the whole orchestra
 * shouldn't count each view. The record is still checked first, so a photo taken away or not
 * visible to this person is never served from the cache.
 */
export const GET: RequestHandler = async ({ params, locals, request, url }) => {
	const size = SIZES[params.size as keyof typeof SIZES];
	const storage = size ? await albumStorage() : null;
	if (!storage) error(404, t.error.notFound);
	const photo = await storage.store.photo(params.id);
	if (!photo) error(404, t.error.notFound);
	const open = photo.status === 'approved' && photo.public;
	if (!open) {
		const viewer = await albumViewer(locals);
		if (!viewer || !visiblePhotos([photo], viewer).length) error(404, t.error.notFound);
	}
	const headers: Record<string, string> = {
		// A photo taken off the website is gone from shared caches within the hour.
		'cache-control': open ? 'public, max-age=3600' : 'private, max-age=86400',
		// Shown as an image, never run: the demo's pictures are SVG.
		'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
		'x-content-type-options': 'nosniff',
		'cross-origin-resource-policy': open ? 'cross-origin' : 'same-origin',
		...(open ? { 'access-control-allow-origin': '*' } : {})
	};

	// Keyed by photo and size only, never by who asked: access was decided above.
	const cache = edgeCache();
	const key = new Request(`${url.origin}/__album-cache/${photo.id}/${size}`);
	const cached = await cache?.match(key).catch(() => undefined);
	if (cached) {
		const etag = cached.headers.get('etag');
		if (etag && request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ...headers, etag } });
		return new Response(cached.body, { headers: { ...headers, 'content-type': cached.headers.get('content-type') ?? photo.type, ...(etag ? { etag } : {}) } });
	}

	const file = await storage.files.get(photo.id, size);
	if (!file) error(404, t.error.notFound);
	const withEtag = { ...headers, 'content-type': file.type, ...(file.etag ? { etag: file.etag } : {}) };
	if (file.etag && request.headers.get('if-none-match') === file.etag) return new Response(null, { status: 304, headers: withEtag });
	if (!cache) return new Response(file.body as BodyInit, { headers: withEtag });
	const [mine, kept] = new Response(file.body as BodyInit).body!.tee();
	// The cache's copy may be kept a day; it's only ever handed out after the check above.
	const copy = new Response(kept, { headers: { 'content-type': file.type, 'cache-control': 'public, max-age=86400', ...(file.etag ? { etag: file.etag } : {}) } });
	runInBackground(cache.put(key, copy).catch((cause) => console.error('Keeping a photo in the cache failed:', cause)));
	return new Response(mine, { headers: withEtag });
};
