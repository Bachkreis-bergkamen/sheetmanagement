import { error, json } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import * as t from '#lib/i18n/texts.ts';
import { mergeMarks, type Stroke } from '#lib/practice/marks.ts';
import { getStore, type ShareAnswer } from '#lib/server/db/index.ts';
import { offersFor, requireOwnPart } from '#lib/server/practice.ts';
import type { RequestHandler } from './$types';

const ANSWERS: ShareAnswer[] = ['all', 'some', 'declined'];

/**
 * Answers an offer of notes from someone in the member's section: `{ id, answer }`. With
 * "all", its marks join the member's own, page by page, as far as each page has room; the
 * pages come back as they are now. "some" (taken one by one in the viewer, saved as the member's
 * own) and "declined" only end the offer for them.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = locals.access.user;
	if (locals.auth !== 'on' || !user || !locals.access.member) error(403, t.messages.signInFirst);
	const body = (await request.json().catch(() => null)) as { id?: unknown; answer?: unknown } | null;
	if (typeof body?.id !== 'string' || !ANSWERS.includes(body.answer as ShareAnswer)) error(400);
	const email = normalizeEmail(user.email);
	const store = getStore();
	const share = await store.shareById(body.id);
	if (!share) error(404);
	await requireOwnPart(email, share.file);
	// Only an offer still made to them: from someone else who plays the part.
	if (!(await offersFor(email, share.file)).some((offer) => offer.id === share.id)) error(404);

	const pages: Record<number, Stroke[]> = {};
	let skipped = 0;
	if (body.answer === 'all') {
		const own = new Map((await store.marksOf(email, share.file)).map((page) => [page.page, page.strokes]));
		for (const [page, offered] of Object.entries(share.pages)) {
			const merged = mergeMarks(own.get(Number(page)) ?? [], offered);
			skipped += merged.skipped;
			await store.saveMarks(email, share.file, Number(page), merged.strokes);
			pages[Number(page)] = merged.strokes;
		}
	}
	await store.answerShare(share.id, email, body.answer as ShareAnswer);
	return json({ pages, skipped });
};
