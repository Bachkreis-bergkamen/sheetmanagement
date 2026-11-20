import { splitList } from './lists.ts';
import { normalize } from './sheet.ts';
import { germanCollator } from '#lib/text.ts';

/**
 * The orchestra's history (#61): every past concert with its programme, and what it adds
 * up to: the pieces played most, the ones not played for years, the repertoire per decade.
 * Works on plain data, so the season report (#147) can use the same counting.
 */

export interface ChronicleItem {
	title: string;
	/** Link target, when the name matches a piece. */
	pieceId?: string;
	composer?: string;
}

export interface ChronicleConcert {
	id: string;
	title: string;
	/** "1957-12-21", "1957-12", "1957", or empty when unknown. */
	dateKey: string;
	location?: string;
	program: ChronicleItem[];
}

export interface ChroniclePiece {
	id: string;
	title: string;
	composer?: string;
	/** Has sheet music in the archive, so it could be played again. */
	hasMusic: boolean;
}

/** Played this many years ago or longer: "lange nicht gespielt". */
export const LONG_AGO_YEARS = 10;
const TOP = 10;
const NEVER_PLAYED_SHOWN = 12;

/** One piece, whether it links to the archive or is only a name in an old programme. */
export const pieceKey = (item: Pick<ChronicleItem, 'pieceId' | 'title'>) => item.pieceId ?? `title:${normalize(item.title)}`;

const yearOf = (concert: Pick<ChronicleConcert, 'dateKey'>) => (concert.dateKey ? Number(concert.dateKey.slice(0, 4)) : undefined);


/** Oldest first; concerts without a date can't be placed and are left out. */
function datedOldestFirst<C extends ChronicleConcert>(concerts: C[]): C[] {
	return concerts.filter((concert) => concert.dateKey).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.id.localeCompare(b.id));
}

/**
 * The concert at which each piece was played for the first time, by piece key. A piece
 * whose only performances have no date has no first one.
 */
export function firstPerformances(concerts: ChronicleConcert[]): Map<string, string> {
	const first = new Map<string, string>();
	for (const concert of datedOldestFirst(concerts)) {
		for (const item of concert.program) {
			const key = pieceKey(item);
			if (!first.has(key)) first.set(key, concert.id);
		}
	}
	return first;
}

export interface PlayedPiece {
	key: string;
	title: string;
	pieceId?: string;
	composer?: string;
	/** Concerts it was on the programme of. */
	count: number;
	firstYear?: number;
	lastYear?: number;
}

/** Each piece with how often and when it was played; a piece twice in one programme counts once. */
export function playedPieces(concerts: ChronicleConcert[]): Map<string, PlayedPiece> {
	const played = new Map<string, PlayedPiece>();
	for (const concert of concerts) {
		const year = yearOf(concert);
		const seen = new Set<string>();
		for (const item of concert.program) {
			const key = pieceKey(item);
			if (seen.has(key)) continue;
			seen.add(key);
			const entry = played.get(key) ?? { key, title: item.title, pieceId: item.pieceId, composer: item.composer, count: 0 };
			entry.count++;
			entry.composer ??= item.composer;
			if (year !== undefined) {
				entry.firstYear = Math.min(entry.firstYear ?? year, year);
				entry.lastYear = Math.max(entry.lastYear ?? year, year);
			}
			played.set(key, entry);
		}
	}
	return played;
}

export interface Decade {
	/** 1960 for the sixties. */
	decade: number;
	concerts: number;
	pieces: number;
	/** The composers played most in it, at most three. */
	composers: string[];
}

export interface ComposerCount {
	name: string;
	/** Performances: each time one of their pieces was on a programme. */
	count: number;
	/** Different pieces of theirs that were played. */
	pieces: number;
}

export interface ChronicleStats {
	concerts: number;
	firstYear?: number;
	lastYear?: number;
	/** Programme entries, a piece twice in one programme counted once. */
	performances: number;
	pieces: number;
	/** The pieces played most often; only pieces played more than once. */
	mostPlayed: PlayedPiece[];
	/** Played before, but not for LONG_AGO_YEARS years or more; longest ago first. */
	longAgo: (PlayedPiece & { planned: boolean })[];
	/** Pieces with music in the archive that no programme lists; a few names and the count. */
	neverPlayed: { count: number; pieces: { id: string; title: string; composer?: string }[] };
	decades: Decade[];
	composers: ComposerCount[];
}

/** Counts by composer; a piece by "Mozart, Haydn" counts for both. Most first, then by name. */
function composerCounts(played: PlayedPiece[]): ComposerCount[] {
	const counts = new Map<string, ComposerCount>();
	for (const piece of played) {
		for (const name of splitList(piece.composer)) {
			const key = normalize(name);
			const entry = counts.get(key) ?? { name, count: 0, pieces: 0 };
			entry.count += piece.count;
			entry.pieces++;
			counts.set(key, entry);
		}
	}
	return [...counts.values()].sort((a, b) => b.count - a.count || b.pieces - a.pieces || germanCollator.compare(a.name, b.name));
}

/**
 * What the history adds up to. `concerts` are the past ones; `thisYear` decides what is "long
 * ago"; `planned` are the piece keys of coming concerts, so a piece back on a programme says so.
 */
export function chronicleStats(concerts: ChronicleConcert[], archive: ChroniclePiece[], thisYear: number, planned = new Set<string>()): ChronicleStats {
	const played = playedPieces(concerts);
	const all = [...played.values()];
	const years = concerts.map(yearOf).filter((year) => year !== undefined);

	const byDecade = new Map<number, ChronicleConcert[]>();
	for (const concert of concerts) {
		const year = yearOf(concert);
		if (year === undefined) continue;
		const decade = Math.floor(year / 10) * 10;
		byDecade.set(decade, [...(byDecade.get(decade) ?? []), concert]);
	}
	const decades = [...byDecade.entries()]
		.sort(([a], [b]) => a - b)
		.map(([decade, list]) => {
			const inDecade = [...playedPieces(list).values()];
			return { decade, concerts: list.length, pieces: inDecade.length, composers: composerCounts(inDecade).slice(0, 3).map((c) => c.name) };
		});

	const playedIds = new Set(all.flatMap((piece) => (piece.pieceId ? [piece.pieceId] : [])));
	const playedTitles = new Set(all.map((piece) => normalize(piece.title)));
	const never = archive
		.filter((piece) => piece.hasMusic && !playedIds.has(piece.id) && !playedTitles.has(normalize(piece.title)))
		.sort((a, b) => germanCollator.compare(a.title, b.title));

	return {
		concerts: concerts.length,
		firstYear: years.length ? Math.min(...years) : undefined,
		lastYear: years.length ? Math.max(...years) : undefined,
		performances: all.reduce((sum, piece) => sum + piece.count, 0),
		pieces: all.length,
		mostPlayed: all
			.filter((piece) => piece.count > 1)
			.sort((a, b) => b.count - a.count || (b.lastYear ?? 0) - (a.lastYear ?? 0) || germanCollator.compare(a.title, b.title))
			.slice(0, TOP),
		longAgo: all
			.filter((piece) => piece.lastYear !== undefined && thisYear - piece.lastYear >= LONG_AGO_YEARS)
			.sort((a, b) => a.lastYear! - b.lastYear! || germanCollator.compare(a.title, b.title))
			.map((piece) => ({ ...piece, planned: planned.has(piece.key) })),
		neverPlayed: {
			count: never.length,
			pieces: never.slice(0, NEVER_PLAYED_SHOWN).map(({ id, title, composer }) => ({ id, title, composer }))
		},
		decades,
		composers: composerCounts(all).slice(0, TOP)
	};
}

export interface TimelineConcert extends ChronicleConcert {
	/** Programme positions played here for the first time. */
	debuts: number[];
}

export interface TimelineDecade {
	/** The decade, or null for concerts without a date. */
	decade: number | null;
	years: { year: number | null; concerts: TimelineConcert[] }[];
}

/** The concerts by decade and year, newest first, each programme marked where a piece was new. */
export function timeline(concerts: ChronicleConcert[]): TimelineDecade[] {
	const first = firstPerformances(concerts);
	const sorted = [...concerts].sort((a, b) => b.dateKey.localeCompare(a.dateKey) || germanCollator.compare(a.title, b.title));
	const decades: TimelineDecade[] = [];
	for (const concert of sorted) {
		const year = yearOf(concert) ?? null;
		const decade = year === null ? null : Math.floor(year / 10) * 10;
		let group = decades.find((d) => d.decade === decade);
		if (!group) decades.push((group = { decade, years: [] }));
		let yearGroup = group.years.find((y) => y.year === year);
		if (!yearGroup) group.years.push((yearGroup = { year, concerts: [] }));
		const debuts = concert.program.flatMap((item, i) => (first.get(pieceKey(item)) === concert.id ? [i] : []));
		yearGroup.concerts.push({ ...concert, debuts });
	}
	// Sorted newest first, an empty date key last: so are the decades, undated ones at the end.
	return decades;
}
