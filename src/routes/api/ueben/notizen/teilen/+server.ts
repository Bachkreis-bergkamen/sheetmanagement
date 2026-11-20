import { error, json } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import * as t from '#lib/i18n/texts.ts';
import { getStore } from '#lib/server/db/index.ts';
import { requireOwnPart } from '#lib/server/practice.ts';
import type { RequestHandler } from './$types';

/** Offers per member and minute. */
const PER_MINUTE = 10;

async function asked(locals: App.Locals, request: Request) {
	const user = locals.access.user;
	if (locals.auth !== 'on' || !user || !locals.access.member) error(403, t.messages.signInFirst);
	const body = (await request.json().catch(() => null)) as { file?: unknown } | null;
	if (typeof body?.file !== 'string') error(400);
	const email = normalizeEmail(user.email);
	await requireOwnPart(email, body.file);
	return { email, file: body.file };
}

/**
 * Offers the member's notes in a part to the others who play it: `{ file }`, a copy of the
 * pages as saved now, replacing an earlier offer of that part. They take them over or decline.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const { email, file } = await asked(locals, request);
	const store = getStore();
	if ((await store.hit(`share:${email}`, 1)) > PER_MINUTE) error(429);
	const pages = await store.marksOf(email, file);
	if (!pages.length) error(400, t.practice.share.nothing);
	const share = await store.shareMarks(email, file, Object.fromEntries(pages.map((page) => [page.page, page.strokes])));
	return json({ at: share.at });
};

/** Takes the member's offer in a part back: `{ file }`. What others took over stays theirs. */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	const { email, file } = await asked(locals, request);
	await getStore().unshareMarks(email, file);
	return new Response(null, { status: 204 });
};
