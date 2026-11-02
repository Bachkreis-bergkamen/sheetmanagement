import { error, fail } from '@sveltejs/kit';
import { countingMembers, normalizeEmail, type AccessList } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { formatDay } from '#lib/events/format.ts';
import { newId } from '#lib/feedback/feedback.ts';
import { t } from '#lib/i18n/index.ts';
import { instrumentLabel } from '#lib/music/instrument-label.ts';
import { formatInstrument, parseInstruments, playableInstruments, PART_NUMBERS } from '#lib/music/my-parts.ts';
import { assignmentsOf, checkAssignment, forMember, type PartAssignment } from '#lib/music/part-assignments.ts';
import { normalize } from '#lib/repertoire/sheet.ts';
import { formText } from './feedback.ts';
import { getLibrary, isPastConcert, type Library, type LibraryConcert, type LibraryPiece } from './library.ts';
import { today } from './members.ts';
import { getAccessList } from './repertoire.ts';
import { appendRecords, deleteRows, ensureTab, readTab, refreshAfterWrite, SheetLayoutError } from './sheet-writes.ts';

/**
 * The "Stimmenzuteilung" editor (#262) on a piece's page: the conductor (programmes) or the
 * librarian (pieces) says who plays which part instead of their own, for this piece or every
 * piece, for one concert or always.
 */

export const canAssign = (locals: App.Locals) => locals.access.rights.has('programme.bearbeiten') || locals.access.rights.has('stuecke.bearbeiten');

function requireAssign(locals: App.Locals) {
	if (!canAssign(locals)) error(locals.access.user || locals.auth === 'off' ? 403 : 401, t.messages.noRight);
}

/** The concerts an assignment can be for: coming ones with a row in the sheet, those playing the piece first. */
function assignConcerts(library: Library, piece: LibraryPiece) {
	return library.concerts
		.filter((concert) => concert.sheet && !isPastConcert(concert, library.today))
		.reverse()
		.sort((a, b) => Number(piece.playedAt.includes(b.id)) - Number(piece.playedAt.includes(a.id)))
		.map((concert) => ({ value: concert.sheet!.title, label: concert.label ? `${concert.title} · ${concert.label.long}` : concert.title }));
}

/** Who can be named: every playable instrument, and the active members by name. */
function whoOptions(library: Library, access: AccessList | null) {
	const members = countingMembers(access?.members ?? [], undefined, library.today)
		.filter((member) => member.name)
		.sort((a, b) => a.name.localeCompare(b.name, config.locale))
		.map((member) => ({ value: member.email, label: member.instrument ? `${member.name} (${member.instrument})` : member.name }));
	return { instruments: playableInstruments(config).map((name) => ({ value: name, label: instrumentLabel(name) })), members };
}

/** "Saxophon", "Anna Beispiel": an assignment's "Wer" as people read it. */
export function whoLabel(who: string, access: AccessList | null): string {
	if (forMember({ who })) return access?.membersByEmail.get(normalizeEmail(who))?.name || who;
	const choices = parseInstruments(who, config);
	return choices.length ? choices.map(formatInstrument).join(', ') : who;
}

const partLabel = (part: string) => {
	const choices = parseInstruments(part, config);
	return choices.length ? choices.map(formatInstrument).join(', ') : part;
};

/** The concert titles ("Anlass") a piece is coming up in: where assignments for one concert hold on its page. */
export function comingConcerts(library: Library, piece: LibraryPiece): string[] {
	return piece.playedAt
		.map((id) => library.concertsById.get(id))
		.filter((concert): concert is LibraryConcert => !!concert?.sheet && !isPastConcert(concert, library.today))
		.map((concert) => concert.sheet!.title);
}

/** The piece's assignments, including those for every piece, and the form for who may change them. */
export function assignmentEditor(library: Library, piece: LibraryPiece, assignments: PartAssignment[], access: AccessList | null, locals: App.Locals) {
	const concerts = new Map(library.concerts.flatMap((concert) => (concert.sheet ? [[normalize(concert.sheet.title), concert] as const] : [])));
	const shown = assignmentsOf(assignments, piece.sheet?.title ?? piece.title)
		.map((assignment) => {
			const concert = assignment.concert ? concerts.get(normalize(assignment.concert)) : undefined;
			return {
				id: assignment.id,
				who: whoLabel(assignment.who, access),
				part: partLabel(assignment.part),
				everyPiece: !assignment.pieceName,
				concert: assignment.concert ? (concert?.title ?? assignment.concert) : undefined,
				by: assignment.by,
				at: /^\d{4}-\d{2}-\d{2}$/.test(assignment.at) ? formatDay(assignment.at, config.locale) : assignment.at,
				past: !!concert && isPastConcert(concert, library.today)
			};
		})
		// Those for concerts that are over don't hold any more.
		.filter((assignment) => !assignment.past);
	const canWrite = canAssign(locals) && !!piece.sheet;
	return {
		list: shown,
		form: canWrite
			? { who: whoOptions(library, access), parts: playableInstruments(config).map((name) => ({ value: name, label: instrumentLabel(name) })), numbers: PART_NUMBERS, concerts: assignConcerts(library, piece) }
			: null
	};
}

/** The "addAssignment" action. */
export async function addAssignment(pieceId: string, request: Request, locals: App.Locals) {
	requireAssign(locals);
	const library = await getLibrary();
	const piece = library.piecesById.get(pieceId);
	if (!piece?.sheet) error(404, t.messages.noPiece);
	const data = await request.formData();
	const number = Number(formText(data, 'number'));
	const instrument = formText(data, 'part', 100);
	const input = {
		who: formText(data, 'who', 200),
		part: instrument ? formatInstrument({ instrument, numbers: PART_NUMBERS.includes(number) ? [number] : [] }) : '',
		concert: formText(data, 'concert', 300)
	};
	const everyPiece = data.get('everyPiece') === 'on';
	const access = await getAccessList();
	const options = whoOptions(library, access);
	const checked = checkAssignment(
		input,
		{ who: [...options.instruments, ...options.members].map((option) => option.value), concerts: assignConcerts(library, piece).map((concert) => concert.value) },
		config
	);
	if ('problem' in checked) return fail(400, { assignError: t.partAssignments.problems[checked.problem] });
	try {
		await ensureTab('partAssignments');
		const table = await readTab('partAssignments');
		await appendRecords('partAssignments', table, [
			{
				who: checked.values.who,
				part: checked.values.part,
				piece: everyPiece ? '' : piece.sheet.title,
				concert: checked.values.concert,
				by: locals.access.user?.name ?? '',
				at: today(),
				id: newId()
			}
		]);
		await refreshAfterWrite();
	} catch (cause) {
		if (cause instanceof SheetLayoutError) return fail(409, { assignError: t.partAssignments.notSetUp });
		console.error('Saving a part assignment failed:', cause);
		return fail(503, { assignError: t.partAssignments.failed });
	}
	return { assignSaved: true };
}

/** The "deleteAssignment" action. */
export async function deleteAssignment(request: Request, locals: App.Locals) {
	requireAssign(locals);
	const id = formText(await request.formData(), 'id', 40);
	try {
		const table = await readTab('partAssignments');
		const row = id ? table.rows.find((r) => r.values.id === id) : undefined;
		if (!row) return fail(409, { assignError: t.partAssignments.gone });
		await deleteRows('partAssignments', table, [row.row]);
		await refreshAfterWrite();
	} catch (cause) {
		if (cause instanceof SheetLayoutError) return fail(409, { assignError: t.partAssignments.notSetUp });
		console.error('Deleting a part assignment failed:', cause);
		return fail(503, { assignError: t.partAssignments.failed });
	}
	return { assignDeleted: true };
}
