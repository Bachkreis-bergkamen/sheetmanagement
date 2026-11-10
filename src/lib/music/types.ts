import type { SectionKind } from './sections.ts';
import type { InstrumentFamily } from '#lib/config/index.ts';
import type { Voice } from './part-name.ts';

export type PartStatus = 'ok' | 'missing' | 'empty' | 'incomplete';

export type PartKind =
	/** The conductor's score. */
	| 'partitur'
	/** A featured solo part ("@" prefix or "Solo"). */
	| 'solo'
	/** One part for one instrument. */
	| 'stimme'
	/** Several instruments or voices in one file, e.g. "Pauke & Schlagwerk", "Horn I & II". */
	| 'sammelstimme'
	| 'audio'
	/** Anything without a recognised instrument. */
	| 'sonstiges';

export interface Part {
	id: string;
	fileName: string;
	/** Display name in the orchestra's convention, e.g. "Klarinette I & II in B". */
	label: string;
	kind: PartKind;
	/** Family of the first instrument, for grouping. */
	family?: InstrumentFamily;
	/** Canonical names of the instruments in this file. */
	instruments: string[];
	/** The instruments with their part numbers, for finding a member's part. */
	voices: Voice[];
	notes: string[];
	status: PartStatus;
	mimeType: string;
	subfolder?: string;
	/** Key of the section it belongs to (see PieceDetail.sections). */
	section: string;
	/** For sorting within a piece. */
	order: number;
}

/**
 * A set of parts within one piece folder: what is played, a movement, the complete
 * work. Most pieces have one section; the piece page shows tabs when there are more.
 */
export interface Section {
	/** "" for the files directly in the piece folder, else the subfolder's id. */
	key: string;
	/** "2. Satz", "Komplett", or empty for a piece with only one section. */
	label: string;
	kind: SectionKind;
	/** The Drive folder to open for this section. */
	folderId: string;
	partCount: number;
}

/** 'none': a piece known only from the sheet, without sheet music in Drive. */
export type PieceStatus = 'ok' | 'missing' | 'incomplete' | 'empty' | 'none';

export interface PieceSummary {
	id: string;
	title: string;
	composer?: string;
	catalogue?: string;
	category?: string;
	/** Current programmes it's in, e.g. ["A-Orchester", "Ehemaligenorchester"]. */
	programs: string[];
	partCount: number;
	status: PieceStatus;
	/** Parts in the archive but no conductor's score ("Partitur fehlt"). */
	noScore?: boolean;
	/** Lower-case text without accents, for instant search on the client. */
	search: string;
}

export interface PieceDetail extends PieceSummary {
	folderName: string;
	parts: Part[];
	/** In display order; the first is what is played and opens first. */
	sections: Section[];
}
