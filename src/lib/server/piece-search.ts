import { partInstruments } from '#lib/music/piece-search.ts';
import { parseContents } from '#lib/repertoire/contents.ts';
import { normalize } from '#lib/repertoire/sheet.ts';
import type { getLibrary } from './library.ts';
import type { getPieceNotes } from './repertoire.ts';

type Library = Awaited<ReturnType<typeof getLibrary>>;
type PieceNotes = Awaited<ReturnType<typeof getPieceNotes>>;

/**
 * What else finds a piece besides its title: the instruments with a part, a medley's songs and its notes (the
 * sheet's "Notiz" and the piece's Hinweise). The same for the archive's list and the quick
 * search, so both find the same pieces.
 */
export function pieceFindables(library: Library, pieceNotes: PieceNotes) {
	// Hinweise by the piece's title in "Stücke", as on the piece page.
	const hints = new Map<string, string[]>();
	for (const note of pieceNotes.notes) {
		const key = normalize(note.pieceName);
		hints.set(key, [...(hints.get(key) ?? []), note.text]);
	}
	return new Map(
		library.pieces.map(({ id, title, sheet, detail }) => [
			id,
			{
				instruments: partInstruments(detail?.parts ?? []),
				// A medley's songs, as written in "Inhalt": "Habanera – Bizet".
				songs: parseContents(sheet?.contents).map((song) => (song.composer ? `${song.title} – ${song.composer}` : song.title)),
				notes: [sheet?.notes ?? '', ...(hints.get(normalize(sheet?.title ?? title)) ?? [])].filter(Boolean)
			}
		])
	);
}
