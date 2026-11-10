import { error, redirect } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { youtubeId } from '#lib/links.ts';
import { FILE_ORIGINS, partUrl, getCatalog } from '#lib/server/catalog.ts';
import { getStore } from '#lib/server/db/index.ts';
import { getLibrary } from '#lib/server/library.ts';
import { today } from '#lib/server/members.ts';
import { archivePart, offersFor, ownPart } from '#lib/server/practice.ts';
import { getAccessList, getFeedback, getMusicConfig } from '#lib/server/repertoire.ts';
import { isActiveReport } from '#lib/feedback/feedback.ts';
import type { PageServerLoad } from './$types';

const PDF = 'application/pdf';

/**
 * The practice viewer: a part of the member's own instrument, drawn in the app page by page,
 * with the piece's recording, a metronome, a tuner and the member's own pen marks, and what others
 * in their section offer of theirs. With practice
 * time on, the time it's open counts. Any other PDF of the archive opens here too, with the pen
 * but without practice time and sharing; only sign-in off (the app is public then, and the PDFs
 * stay behind Drive's sharing) opens it where "Meine Noten" would.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const elsewhere = () => redirect(303, partUrl(params.id, PDF, locals.access.viaLink), { external: FILE_ORIGINS });
	const user = locals.access.user;
	if (locals.auth !== 'on' || !user || !locals.access.member) elsewhere();
	const email = normalizeEmail(user!.email);
	const store = getStore();
	const [catalog, access, music, library, on] = await Promise.all([
		getCatalog(),
		getAccessList(),
		getMusicConfig(),
		getLibrary(),
		store.practiceOn(email).catch(() => false)
	]);
	if (!catalog.ok) error(503, t.messages.archiveUnavailable);
	const member = access?.membersByEmail.get(email);
	const own = member ? ownPart(catalog.catalog, member.instrument ?? '', music, params.id) : null;
	const found = own ?? (member ? archivePart(catalog.catalog, params.id) : null);
	if (!found) elsewhere();
	const day = today();
	const [days, marks, offers, shared, feedback] = await Promise.all([
		on && own ? store.practiceOf(email) : [],
		store.marksOf(email, params.id).catch(() => []),
		own ? offersFor(email, params.id).catch(() => []) : [],
		own ? store.shareOf(email, params.id).catch(() => null) : null,
		getFeedback().catch(() => null)
	]);
	const recording = library.piecesById.get(found!.piece.id)?.sheet?.recording;
	return {
		file: params.id,
		piece: { id: found!.piece.id, title: found!.piece.title, composer: found!.piece.composer },
		part: found!.part.label,
		elsewhere: partUrl(params.id, PDF, locals.access.viaLink),
		// Their own part: practice time and sharing with the section; any other part is only read (and marked).
		own: !!own,
		// Counted only with practice time on (/profil), and only in their own parts.
		counting: on && !!own,
		todaySeconds: days.find((entry) => entry.day === day)?.seconds ?? 0,
		recording: recording ? { url: recording, youtube: youtubeId(recording) } : null,
		marks: Object.fromEntries(marks.map((page) => [page.page, page.strokes])),
		offers,
		// When the member last offered their notes here to their section.
		sharedAt: shared?.at ?? null,
		// Problems with this part still looked after, so nobody reports them twice (#306).
		reports: (feedback?.reports ?? []).filter((report) => report.fileId === params.id && isActiveReport(report)).map(({ kind, comment }) => ({ kind, comment })),
		canReport: !!feedback?.tables.reports
	};
};
