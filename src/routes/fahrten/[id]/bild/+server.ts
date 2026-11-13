import { error } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { isWikimediaImage, shownPictures, smaller } from '#lib/server/trip-picture.ts';
import { openTrip } from '#lib/server/trips.ts';
import type { RequestHandler } from './$types';

/**
 * The trip's picture (#334), served from the app's own address: members' browsers never ask
 * Wikimedia, so their addresses stay here. Cloudflare keeps the image for a day.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const { trip } = await openTrip(locals, params.id);
	// "?nr=2": the third of the trip's pictures; without it the first.
	const picture = shownPictures(trip)[Number(url.searchParams.get('nr') ?? 0) || 0]?.picture;
	if (!picture || !isWikimediaImage(picture.url)) error(404, t.trips.noAccess);
	// "?klein": the list of trips needs only a small one.
	const response = await fetch(url.searchParams.has('klein') ? smaller(picture.url) : picture.url, {
		headers: { 'user-agent': 'sheetmanagement-trips/1.0 (https://github.com/Bachkreis-bergkamen/sheetmanagement)' },
		cf: { cacheTtl: 86_400, cacheEverything: true }
	} as RequestInit).catch(() => null);
	const type = response?.headers.get('content-type') ?? '';
	if (!response?.ok || !type.startsWith('image/')) error(502, t.trips.failed);
	return new Response(response.body, {
		headers: { 'content-type': type, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' }
	});
};
