/**
 * "Angaben ergänzen": pieces whose details in the sheet have gaps, to work through one
 * after the other with the suggestions on the edit page.
 */

export const DETAIL_FILTERS = ['alle', 'komponist', 'genre', 'hoerbeispiel', 'werkverzeichnis'] as const;
export type DetailFilter = (typeof DETAIL_FILTERS)[number];
export type DetailGap = 'composer' | 'genre' | 'recording' | 'catalogue';

/** Which gaps each filter looks for. "alle" leaves out the Werkverzeichnis: many pieces have none. */
const LOOKS_FOR: Record<DetailFilter, DetailGap[]> = {
	alle: ['composer', 'genre', 'recording'],
	komponist: ['composer'],
	genre: ['genre'],
	hoerbeispiel: ['recording'],
	werkverzeichnis: ['catalogue']
};

/** The gaps a filter is about, e.g. the field to put first while working through its list. */
export const gapsFor = (filter: DetailFilter): DetailGap[] => LOOKS_FOR[filter];

export function parseGapFilter(text: string | null | undefined): DetailFilter | null {
	return DETAIL_FILTERS.find((filter) => filter === text) ?? null;
}

export interface DetailPiece {
	id: string;
	/** As shown: from the sheet, else read from the folder name. */
	composer?: string;
	catalogue?: string;
	sheet?: { genre?: string; recording?: string; noRecording?: boolean };
}

/**
 * The gaps of one piece for a filter. Only pieces with a row in "Stücke" count: that's where
 * the details are kept. A missing Werkverzeichnis only counts when the composer is known.
 */
export function gapsOf(piece: DetailPiece, filter: DetailFilter): DetailGap[] {
	if (!piece.sheet) return [];
	const missing: Record<DetailGap, boolean> = {
		composer: !piece.composer,
		genre: !piece.sheet.genre,
		// "keins" in the sheet: known to have none, nothing to look for.
		recording: !piece.sheet.recording && !piece.sheet.noRecording,
		catalogue: !!piece.composer && !piece.catalogue
	};
	return LOOKS_FOR[filter].filter((gap) => missing[gap]);
}

/** How many pieces each filter finds. */
export function gapCounts(pieces: DetailPiece[]): Record<DetailFilter, number> {
	return Object.fromEntries(DETAIL_FILTERS.map((filter) => [filter, pieces.filter((piece) => gapsOf(piece, filter).length).length])) as Record<
		DetailFilter,
		number
	>;
}

/**
 * The piece to edit after this one: the next in the list with gaps, starting over at the
 * top; null when none is left but this one.
 */
export function nextWithGaps(pieces: DetailPiece[], filter: DetailFilter, current: string): string | null {
	const open = pieces.filter((piece) => gapsOf(piece, filter).length && piece.id !== current);
	const index = pieces.findIndex((piece) => piece.id === current);
	const after = open.find((piece) => pieces.indexOf(piece) > index);
	return (after ?? open[0])?.id ?? null;
}
