import { error } from '@sveltejs/kit';
import { parseAlbumKey } from '#lib/album/album.ts';
import { albumStore } from '#lib/server/album.ts';
import { orchestra } from '#lib/server/env.ts';
import * as t from '#lib/i18n/texts.ts';
import type { RequestHandler } from './$types';

/** Changes when a field is removed or changes its meaning; new fields don't count. */
const PHOTOS_FEED_VERSION = 1;

/**
 * The photos approved for the orchestra's website (#66), as JSON, without sign-in: newest album
 * first. `?konzert=<id>` gives one date's (a concert's id from /api/konzerte), `?fahrt=<id>` one
 * trip's, `?limit=` at most that many (100 by default, 500 at most). Any site may read it (CORS),
 * since it holds only what someone with "fotos.freigeben" chose to make public.
 */
export const GET: RequestHandler = async ({ url }) => {
	const store = await albumStore();
	if (!store) error(404, t.error.notFound);
	const concert = url.searchParams.get('konzert');
	const trip = url.searchParams.get('fahrt');
	const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100));
	const only = concert ? `termin:${concert}` : trip ? `fahrt:${trip}` : null;
	const photos = (await store.photos({ status: 'approved', public: true })).filter((photo) => !only || photo.album === only).slice(0, limit);
	const image = (id: string, size: 'klein' | 'gross') => `${url.origin}/api/fotos/${id}/${size}`;
	const body = {
		version: PHOTOS_FEED_VERSION,
		orchestra: orchestra().name,
		photos: photos.map((photo) => {
			const album = parseAlbumKey(photo.album);
			return {
				id: photo.id,
				...(photo.caption ? { caption: photo.caption } : {}),
				width: photo.width,
				height: photo.height,
				thumbnail: image(photo.id, 'klein'),
				image: image(photo.id, 'gross'),
				album: {
					kind: photo.kind,
					title: photo.title,
					/** "1972", "1972-06" or "2026-11-14". */
					date: photo.day,
					// The date's id, the same as in /api/konzerte for a concert.
					...(album?.type === 'termin' ? { event: album.id } : {}),
					...(album?.type === 'fahrt' ? { trip: album.id } : {})
				}
			};
		})
	};
	return new Response(JSON.stringify(body), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'access-control-allow-origin': '*',
			'cache-control': 'public, max-age=300'
		}
	});
};
