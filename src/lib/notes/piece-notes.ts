import type { OrchestraConfig } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { instrumentLabel } from '#lib/music/instrument-label.ts';
import { playableInstruments } from '#lib/music/my-parts.ts';
import { splitList } from '#lib/repertoire/lists.ts';
import { LAYOUT, normalize, readTable, type ColumnKey, type Table } from '#lib/repertoire/sheet.ts';

/**
 * Notes on a piece ("Hinweise", #125): what was agreed in rehearsal and would otherwise live
 * only in some members' printed copies, like "Sprung von Takt 40 nach 88", "keine
 * Wiederholung" or bowings for the strings. A note may be for one section or instrument, and
 * for one concert, so last year's cut doesn't confuse the next performance. The tab is
 * optional; the first note creates it.
 */

export type PieceNoteTable = Table<ColumnKey<'pieceNotes'> & string>;

export interface PieceNote {
	row: number;
	id: string;
	/** The piece's title in "Stücke". */
	pieceName: string;
	/** Empty: for everyone. Else sections or instruments, as written: "Streicher", "Geige, Bratsche". */
	section: string;
	/** Empty: always. Else the concert's "Anlass". */
	concert: string;
	text: string;
	by: string;
	at: string;
}

export interface PieceNotes {
	notes: PieceNote[];
	table: PieceNoteTable;
}

export function buildPieceNotes(values: string[][]): PieceNotes {
	const table = readTable(values, LAYOUT.pieceNotes.columns);
	const notes = table.rows
		.filter(({ values: v }) => v.piece && v.note)
		.map(({ row, values: v }) => ({
			row,
			id: v.id,
			pieceName: v.piece,
			section: v.section,
			concert: v.concert,
			text: v.note,
			by: v.by,
			at: v.at
		}));
	return { notes, table };
}

/** A piece's notes, matched by its title in "Stücke"; the newest first. */
export function notesOf<N extends Pick<PieceNote, 'pieceName' | 'at' | 'row'>>(notes: N[], title: string): N[] {
	const wanted = normalize(title);
	return notes.filter((note) => normalize(note.pieceName) === wanted).sort((a, b) => b.at.localeCompare(a.at) || b.row - a.row);
}

type Family = OrchestraConfig['instruments'][number]['family'];
type SectionFamily = Exclude<Family, 'partitur' | 'sonstige'>;
const FAMILIES: SectionFamily[] = ['streicher', 'holz', 'blech', 'schlagwerk', 'tasten', 'gesang'];

/** What a note can be for: whole sections first, then single instruments, as the app names them. */
export function sectionOptions(config: OrchestraConfig): { sections: string[]; instruments: string[] } {
	const playable = playableInstruments(config);
	const families = new Set(config.instruments.filter((instrument) => playable.includes(instrument.name)).map((instrument) => instrument.family));
	return {
		sections: FAMILIES.filter((family) => families.has(family)).map((family) => t.piece.groups[family]),
		instruments: playable.map(instrumentLabel)
	};
}

/**
 * Whether a note is for someone playing these instruments (names as in the config). A note
 * for everyone is; so is one whose "Für" names nothing the app knows, since showing a note
 * too often is better than hiding it. Without instruments every note is shown.
 */
export function appliesTo(note: Pick<PieceNote, 'section'>, instruments: string[], config: OrchestraConfig): boolean {
	const items = splitList(note.section).map(normalize);
	if (!items.length || !instruments.length) return true;
	const byName = new Map(config.instruments.map((instrument) => [instrument.name, instrument]));
	const known = new Set<string>(FAMILIES.map((family) => normalize(t.piece.groups[family])));
	for (const instrument of config.instruments) {
		for (const word of [instrument.name, instrumentLabel(instrument.name), ...(instrument.aliases ?? []), ...(instrument.variants ?? [])]) known.add(normalize(word));
	}
	if (!items.some((item) => known.has(item))) return true;
	const mine = new Set<string>();
	for (const name of instruments) {
		const instrument = byName.get(name);
		mine.add(normalize(name));
		mine.add(normalize(instrumentLabel(name)));
		for (const alias of [...(instrument?.aliases ?? []), ...(instrument?.variants ?? [])]) mine.add(normalize(alias));
		if (instrument && instrument.family in t.piece.groups) mine.add(normalize(t.piece.groups[instrument.family as SectionFamily]));
	}
	return items.some((item) => mine.has(item));
}

/** Whether a note is for this concert: notes without a concert are for every one. */
export const forConcert = (note: Pick<PieceNote, 'concert'>, concertTitle: string | undefined) =>
	!note.concert || (!!concertTitle && normalize(note.concert) === normalize(concertTitle));

export const MAX_NOTE = 500;

export type NoteProblem = 'empty' | 'too-long' | 'section' | 'concert';

/** Checks the form against what the page offered; "Für" and "Konzert" must be one of its choices. */
export function checkNote(
	input: { text: string; section: string; concert: string },
	offered: { sections: string[]; concerts: string[] }
): { values: { text: string; section: string; concert: string } } | { problem: NoteProblem } {
	const text = input.text.trim().replace(/\r\n/g, '\n');
	if (!text) return { problem: 'empty' };
	if (text.length > MAX_NOTE) return { problem: 'too-long' };
	const section = input.section.trim();
	if (section && !offered.sections.includes(section)) return { problem: 'section' };
	const concert = input.concert.trim();
	if (concert && !offered.concerts.includes(concert)) return { problem: 'concert' };
	return { values: { text, section, concert } };
}
