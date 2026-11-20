import * as t from '#lib/i18n/texts.ts';
import { programLength, roundMinutes } from './duration.ts';

/**
 * The "Konzert-Check" for planners: what's done and what's still open for one concert,
 * worked out from what the app already knows (programme, parts, rehearsal plan, durations,
 * rented music, the music list). Nothing to tick by hand: an item is done when the data says so.
 */

export interface CheckInput {
	/** The concert is over. */
	past: boolean;
	program: { title: string; status?: string; duration?: number; inReport: boolean }[];
	/** Number of rehearsals in the calendar; the plan is only checked when there are some. */
	rehearsals: number;
	/** Programme pieces not planned in any rehearsal. */
	unplanned: number;
	/** Open loans of programme pieces: due before the concert (upcoming) or still out (past). */
	loans: { title: string; dueBeforeConcert: boolean }[];
	/** Links the items point to. */
	urls: { program: string; plan?: string; report?: string; loans?: string; gaps: string };
}

export interface CheckItem {
	key: string;
	ok: boolean;
	text: string;
	href?: string;
}

export function concertCheck(input: CheckInput): CheckItem[] {
	const items: CheckItem[] = [];
	const { program, urls } = input;
	const count = program.length;
	const pieces = t.check.pieces;
	const reportGaps = program.filter((item) => !item.inReport).length;
	const open = input.loans.filter((loan) => input.past || loan.dueBeforeConcert);

	if (input.past) {
		// The music list only while it's on (#134).
		if (count && urls.report) {
			items.push(
				reportGaps
					? { key: 'report', ok: false, text: t.check.reportGaps(pieces(reportGaps)), href: urls.report }
					: { key: 'report', ok: true, text: t.check.reportReady, href: urls.report }
			);
		}
		if (open.length) items.push({ key: 'loans', ok: false, text: t.check.returnLoans(open.map((loan) => loan.title).join(', ')), href: urls.loans });
		return items;
	}

	items.push(count ? { key: 'program', ok: true, text: t.check.program(count) } : { key: 'program', ok: false, text: t.check.noProgram, href: urls.program });
	if (!count) return items;

	const gaps = program.filter((item) => item.status && item.status !== 'ok').length;
	items.push(gaps ? { key: 'parts', ok: false, text: t.check.partGaps(pieces(gaps)), href: urls.gaps } : { key: 'parts', ok: true, text: t.check.partsComplete });

	if (input.rehearsals) {
		items.push(
			input.unplanned
				? { key: 'plan', ok: false, text: t.rehearsalPlan.unplanned(input.unplanned), href: urls.plan }
				: { key: 'plan', ok: true, text: t.check.planComplete }
		);
	}

	const length = programLength(program.map((item) => item.duration));
	items.push(
		length.missing
			? { key: 'duration', ok: false, text: t.check.durationGaps(pieces(length.missing)), href: urls.report }
			: { key: 'duration', ok: true, text: t.check.duration(roundMinutes(length.seconds)) }
	);

	if (open.length) items.push({ key: 'loans', ok: false, text: t.check.loansDue(open.map((loan) => loan.title).join(', ')), href: urls.loans });
	return items;
}
