import { error } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { bandArt, filmArt, filmImageUrl, musicalArt } from '#lib/server/film-art.ts';
import { portraitHeaders } from '#lib/server/portraits.ts';
import type { RequestHandler } from './$types';

/** A month: logos and icons don't change, and the browser and the offline cache keep them. */
const MAX_AGE_S = 30 * 24 * 60 * 60;

/**
 * A film's logo or icon for the piece page (#312), ?titel=Jurassic Park[&musical], a musical
 * found by its composers, ?titel=Cats&komponist=Andrew Lloyd Webber, or a band's
 * logo (#319), ?band=Queen. Only what the
 * lookup found is passed on, so this can't fetch other files; members' devices never contact
 * Wikimedia or Iconify.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (locals.auth === 'on' && !locals.access.member) error(401, t.messages.signInFirst);
	const title = url.searchParams.get('titel')?.trim().slice(0, 200) ?? '';
	const band = url.searchParams.get('band')?.trim().slice(0, 200) ?? '';
	const composer = url.searchParams.get('komponist')?.trim().slice(0, 200) ?? '';
	const art = title
		? composer
			? await musicalArt(title, composer)
			: await filmArt(title, url.searchParams.has('musical'))
		: band
			? await bandArt(band)
			: null;
	const source = art && filmImageUrl(art);
	if (!source) error(404, t.messages.noPicture);
	const response = await fetch(source, { headers: portraitHeaders, signal: AbortSignal.timeout(10_000) }).catch(() => null);
	const type = response?.headers.get('content-type') ?? '';
	if (!response?.ok || !type.startsWith('image/')) error(502, t.messages.wikimediaUnavailable);
	return new Response(response.body, {
		// An SVG icon can't run scripts as an <img>, and this keeps it so when opened on its own.
		headers: { 'content-type': type, 'cache-control': `public, max-age=${MAX_AGE_S}, immutable`, 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" }
	});
};
