import { normalizeEmail } from '#lib/access/access.ts';
import type { OrchestraConfig } from '#lib/config/index.ts';
import { LAYOUT, normalize, readTable, type ColumnKey, type Table } from '#lib/repertoire/sheet.ts';
import { parseInstruments, type InstrumentChoice } from './my-parts.ts';

/**
 * Who plays which part instead of their own ("Stimmenzuteilung", #262): the saxophones play
 * the bassoon part, Anna plays Cello in the Egmont. The conductor or the librarian decides;
 * an assignment names a member or an instrument (all its players), may be for one piece and
 * for one concert, and is otherwise for every piece and always. The tab is optional; the
 * first assignment creates it.
 */

export type PartAssignmentTable = Table<ColumnKey<'partAssignments'> & string>;

export interface PartAssignment {
	row: number;
	id: string;
	/** A member's e-mail, or an instrument as written ("Saxophon", "Geige II"). */
	who: string;
	/** The part played instead, as written: "Fagott II". */
	part: string;
	/** The piece's title in "Stücke"; empty: every piece. */
	pieceName: string;
	/** The concert's "Anlass"; empty: always. */
	concert: string;
	by: string;
	at: string;
}

export interface PartAssignments {
	assignments: PartAssignment[];
	table: PartAssignmentTable;
}

export function buildPartAssignments(values: string[][]): PartAssignments {
	const table = readTable(values, LAYOUT.partAssignments.columns);
	const assignments = table.rows
		.filter(({ values: v }) => v.who && v.part)
		.map(({ row, values: v }) => ({
			row,
			id: v.id,
			who: v.who,
			part: v.part,
			pieceName: v.piece,
			concert: v.concert,
			by: v.by,
			at: v.at
		}));
	return { assignments, table };
}

/** An assignment names a member by their address; anything else is an instrument. */
export const forMember = (assignment: Pick<PartAssignment, 'who'>) => assignment.who.includes('@');

/** Someone who plays: their address and what they play themselves. */
export interface Player {
	email?: string;
	choices: InstrumentChoice[];
}

/** Where the parts are needed: a piece (its title in "Stücke"), in one of these concerts ("Anlass"), or in none. */
export interface Occasion {
	piece: string;
	concerts?: string[];
}

/** What someone plays from; `assigned` when an assignment says so rather than their own instrument. */
export interface PlayerChoice extends InstrumentChoice {
	assigned?: boolean;
}

/**
 * Whether an assignment's "Wer" is this player, and which of their instrument choices it
 * replaces: all of them for a member (who may have none, like a conductor sitting in), else
 * those of the instrument.
 */
function covers(assignment: PartAssignment, player: Player, config: OrchestraConfig): InstrumentChoice[] | null {
	if (forMember(assignment)) return player.email && normalizeEmail(assignment.who) === normalizeEmail(player.email) ? player.choices : null;
	const named = parseInstruments(assignment.who, config);
	const covered = player.choices.filter((choice) =>
		named.some(
			(target) =>
				target.instrument === choice.instrument &&
				(!target.numbers.length || !choice.numbers.length || target.numbers.some((n) => choice.numbers.includes(n)))
		)
	);
	return covered.length ? covered : null;
}

const appliesAt = (assignment: PartAssignment, occasion: Occasion) =>
	(!assignment.pieceName || normalize(assignment.pieceName) === normalize(occasion.piece)) &&
	(!assignment.concert || (occasion.concerts ?? []).some((concert) => normalize(concert) === normalize(assignment.concert)));

/** The narrower an assignment, the more it counts: one piece beats one concert beats always; a member beats an instrument. */
const weight = (assignment: PartAssignment) => (assignment.pieceName ? 4 : 0) + (assignment.concert ? 2 : 0) + (forMember(assignment) ? 1 : 0);

/**
 * What a player plays from at this occasion: their own instruments, with those an assignment
 * covers replaced by the assigned parts. Of several assignments only the narrowest count, so
 * "Anna plays Cello in the Egmont" wins over "the saxophones play Fagott".
 */
export function choicesAt(player: Player, assignments: PartAssignment[], occasion: Occasion, config: OrchestraConfig): PlayerChoice[] {
	const applying = assignments
		.filter((assignment) => appliesAt(assignment, occasion))
		.map((assignment) => ({ assignment, covered: covers(assignment, player, config) }))
		.flatMap(({ assignment, covered }) => (covered ? [{ assignment, covered }] : []));
	if (!applying.length) return player.choices;
	const top = Math.max(...applying.map(({ assignment }) => weight(assignment)));
	const chosen = applying.filter(({ assignment }) => weight(assignment) === top);
	const replaced = new Set(chosen.flatMap(({ covered }) => covered));
	const assigned: PlayerChoice[] = [];
	for (const { assignment } of chosen) {
		for (const choice of parseInstruments(assignment.part, config)) {
			const known = assigned.find((other) => other.instrument === choice.instrument);
			if (!known) assigned.push({ ...choice, assigned: true });
			else if (known.numbers.length) known.numbers = choice.numbers.length ? [...new Set([...known.numbers, ...choice.numbers])].sort((a, b) => a - b) : [];
		}
	}
	// An assigned part that can't be read keeps the player on their own instrument.
	if (!assigned.length) return player.choices;
	return [...assigned, ...player.choices.filter((choice) => !replaced.has(choice))];
}

/** An assignment's piece, in a list of assignments: its title in "Stücke", compared like the app compares titles. */
export const assignmentsOf = <A extends Pick<PartAssignment, 'pieceName'>>(assignments: A[], title: string): A[] =>
	assignments.filter((assignment) => !assignment.pieceName || normalize(assignment.pieceName) === normalize(title));

export type AssignmentProblem = 'who' | 'part' | 'concert';

/** Checks the form against what the page offered; "Wer" and "Konzert" must be one of its choices, "Spielt" a part the app can read. */
export function checkAssignment(
	input: { who: string; part: string; concert: string },
	offered: { who: string[]; concerts: string[] },
	config: OrchestraConfig
): { values: { who: string; part: string; concert: string } } | { problem: AssignmentProblem } {
	const who = input.who.trim();
	if (!who || !offered.who.includes(who)) return { problem: 'who' };
	const part = input.part.trim();
	if (!part || !parseInstruments(part, config).length) return { problem: 'part' };
	const concert = input.concert.trim();
	if (concert && !offered.concerts.includes(concert)) return { problem: 'concert' };
	return { values: { who, part, concert } };
}
