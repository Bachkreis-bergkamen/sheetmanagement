import { error } from '@sveltejs/kit';
import type { User } from '#lib/access/access.ts';
import { REPORT_KINDS, type ReportKind } from '#lib/feedback/feedback.ts';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { cleanLink } from '#lib/links.ts';
import { formatInstrument, playableInstruments } from '#lib/music/my-parts.ts';
import { addReport, formText } from '#lib/server/feedback.ts';
import { getLibrary } from '#lib/server/library.ts';
import { SheetLayoutError } from '#lib/server/sheet-writes.ts';

/** What the form shows after sending: thanks, or what went wrong and the status for it. */
export type ReportResult = { reported: true } | { reportError: string; status: number };

/**
 * A problem report (Meldung) from a form, the same from the piece page, the practice viewer and
 * "Meine Noten" (#306): the kind, the part's file (named from the archive, not the form), or for a
 * part that's missing its instrument and number, a comment, and for the Hörbeispiel a better link.
 * A piece that doesn't exist is a 404.
 */
export async function reportFromForm(user: User, pieceId: string, data: FormData): Promise<ReportResult> {
	const kind = formText(data, 'kind') as ReportKind;
	if (!REPORT_KINDS.includes(kind)) return { reportError: t.reports.failed, status: 400 };

	const piece = (await getLibrary()).piecesById.get(pieceId);
	// A piece without parts has only its Hörbeispiel to report.
	if (!piece || (!piece.detail && !(piece.sheet && kind === 'recording'))) error(404, t.messages.noPiece);
	// A better Hörbeispiel goes along with "Hörbeispiel falsch"; only web links.
	const rawLink = kind === 'recording' ? formText(data, 'link', 500) : '';
	const link = rawLink ? cleanLink(rawLink) : '';
	if (link === undefined) return { reportError: t.wishes.invalidLink, status: 400 };
	// The part's name comes from the archive, not from the form.
	const fileId = kind === 'recording' ? '' : formText(data, 'fileId');
	const part = fileId ? piece.detail?.parts.find((p) => p.id === fileId) : undefined;
	if (fileId && !part) return { reportError: t.reports.unknownPart, status: 400 };
	// A missing part has no file: it's named by instrument and number, from the configured list.
	const instrument = formText(data, 'missingInstrument');
	let missingLabel = '';
	if (kind === 'missing' && !fileId && instrument) {
		if (!playableInstruments(config).includes(instrument)) return { reportError: t.reports.unknownPart, status: 400 };
		const number = Number(formText(data, 'missingNumber'));
		missingLabel = formatInstrument({ instrument, numbers: number >= 1 && number <= 8 ? [number] : [] });
	}

	try {
		await addReport(user, {
			pieceId: piece.id,
			pieceName: piece.title,
			part: part?.label ?? missingLabel,
			fileId,
			kind,
			comment: formText(data, 'comment', 1000),
			link
		});
		return { reported: true };
	} catch (cause) {
		if (cause instanceof SheetLayoutError) return { reportError: t.reports.notSetUp, status: 409 };
		console.error('Saving a problem report failed:', cause);
		return { reportError: t.reports.failed, status: 503 };
	}
}
