import { error, json } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { parseStrokes } from '#lib/practice/marks.ts';
import { getCatalog } from '#lib/server/catalog.ts';
import { getStore } from '#lib/server/db/index.ts';
import { archivePart } from '#lib/server/practice.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { RequestHandler } from './$types';

/**
 * The member's own marks in these parts (`?dateien=a,b`), by file and page, for the merged PDF
 * of a concert's parts. Only ever the signed-in member's.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.access.user;
	if (locals.auth !== 'on' || !user || !locals.access.member) error(403, t.messages.signInFirst);
	const files = new Set((url.searchParams.get('dateien') ?? '').split(',').filter(Boolean).slice(0, 200));
	const marks: Record<string, Record<number, unknown>> = {};
	for (const page of await getStore().marksOf(normalizeEmail(user.email))) {
		if (files.has(page.file)) (marks[page.file] ??= {})[page.page] = page.strokes;
	}
	return json(marks, { headers: { 'cache-control': 'private, no-store' } });
};

/** Saves per member and minute; the viewer saves a page a moment after the pen stops. */
const PER_MINUTE = 30;

/**
 * The member's own marks on one page of a part, from the practice viewer: `{ file, page,
 * strokes }`, replacing what was there; no strokes forget the page. Only for the signed-in
 * member and a PDF of the archive (any part the viewer opens); nobody else ever reads them.
 */
export const PUT: RequestHandler = async ({ locals, request }) => {
	const user = locals.access.user;
	if (locals.auth !== 'on' || !user || !locals.access.member) error(403, t.messages.signInFirst);
	const body = (await request.json().catch(() => null)) as { file?: unknown; page?: unknown; strokes?: unknown } | null;
	const strokes = parseStrokes(body?.strokes);
	const page = body?.page;
	if (typeof body?.file !== 'string' || typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > 500 || !strokes) error(400);

	const email = normalizeEmail(user.email);
	const [catalog, access] = await Promise.all([getCatalog(), getAccessList()]);
	if (!catalog.ok) error(503, t.messages.archiveUnavailable);
	const member = access?.membersByEmail.get(email);
	if (!member || !archivePart(catalog.catalog, body.file)) error(404, t.messages.noFile);
	const store = getStore();
	if ((await store.hit(`marks:${email}`, 1)) > PER_MINUTE) error(429);
	await store.saveMarks(email, body.file, page, strokes);
	return new Response(null, { status: 204 });
};
