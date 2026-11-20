import { error } from '@sveltejs/kit';
import { composerPortrait, portraitHeaders, portraitImageUrl } from '#lib/server/portraits.ts';
import type { RequestHandler } from './$types';
import * as t from '#lib/i18n/texts.ts';

/** A month: portraits don't change, and the browser and the offline cache keep them. */
const MAX_AGE_S = 30 * 24 * 60 * 60;

/**
 * A composer's portrait for the piece page (?komponist=Beethoven). Only what the lookup found
 * is passed on, so this can't fetch other files; members' devices never contact Wikimedia.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (locals.auth === 'on' && !locals.access.member) error(401, t.messages.signInFirst);
	const name = url.searchParams.get('komponist')?.trim().slice(0, 120) ?? '';
	const portrait = name ? await composerPortrait(name) : null;
	if (!portrait) error(404, t.messages.noPicture);
	const response = await fetch(portraitImageUrl(portrait.file), { headers: portraitHeaders, signal: AbortSignal.timeout(10_000) }).catch(
		() => null
	);
	const type = response?.headers.get('content-type') ?? '';
	if (!response?.ok || !type.startsWith('image/')) error(502, t.messages.wikimediaUnavailable);
	return new Response(response.body, {
		headers: { 'content-type': type, 'cache-control': `public, max-age=${MAX_AGE_S}, immutable` }
	});
};
