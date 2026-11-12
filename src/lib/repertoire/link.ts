import { concertKey } from './concert-ref.ts';
import { eventDay, fuzzyDateKey } from './dates.ts';
import { normalize, type Repertoire, type SheetConcert, type SheetPiece } from './sheet.ts';

/** What the link step needs from a piece in the Drive archive. */
export interface DrivePiece {
	id: string;
	title: string;
	composer?: string;
	catalogue?: string;
	folderName: string;
}

/** What the link step needs from a concert in the calendar. */
export interface CalendarConcert {
	id: string;
	displayTitle: string;
	start: string;
	allDay: boolean;
	location?: string;
	/** Marked "(?)" in the calendar; not added to the sheet until confirmed. */
	tentative: boolean;
}

export interface Links {
	/** Sheet row per Drive folder id. */
	pieceByFolder: Map<string, SheetPiece>;
	/** Sheet row per calendar event id. */
	concertByEvent: Map<string, SheetConcert>;
	/** Calendar event id per sheet concert key. */
	eventByConcert: Map<string, string>;
}

/**
 * Matches Drive folders and calendar events to sheet rows: by id first, then rows
 * entered by hand without an id: a piece by its title, a concert by its exact date.
 */
export function linkSources(
	repertoire: Repertoire,
	drivePieces: DrivePiece[],
	calendarConcerts: CalendarConcert[],
	timeZone: string
): Links {
	const pieceByFolder = new Map<string, SheetPiece>();
	const usedPieces = new Set<string>();
	for (const piece of drivePieces) {
		const row = repertoire.piecesByFolder.get(piece.id);
		if (row) {
			pieceByFolder.set(piece.id, row);
			usedPieces.add(row.key);
		}
	}
	for (const piece of drivePieces) {
		if (pieceByFolder.has(piece.id)) continue;
		const row = repertoire.piecesByTitle.get(normalize(piece.title));
		if (row && !row.driveFolderId && !usedPieces.has(row.key)) {
			pieceByFolder.set(piece.id, row);
			usedPieces.add(row.key);
		}
	}

	const concertByEvent = new Map<string, SheetConcert>();
	const eventByConcert = new Map<string, string>();
	const link = (eventId: string, concert: SheetConcert) => {
		concertByEvent.set(eventId, concert);
		eventByConcert.set(concert.key, eventId);
	};
	for (const event of calendarConcerts) {
		const row = repertoire.concertsByEvent.get(event.id);
		if (row) link(event.id, row);
	}
	for (const event of calendarConcerts) {
		if (concertByEvent.has(event.id)) continue;
		const day = eventDay(event, timeZone);
		const row = repertoire.concerts.find(
			(concert) =>
				!concert.eventId && !eventByConcert.has(concert.key) && concert.date?.day && fuzzyDateKey(concert.date) === day
		);
		if (row) link(event.id, row);
	}
	return { pieceByFolder, concertByEvent, eventByConcert };
}

type PieceRow = Partial<Record<keyof Repertoire['tables']['pieces']['indexes'], string>>;
type ConcertRow = Partial<Record<keyof Repertoire['tables']['concerts']['indexes'], string>>;

export interface SyncPlan {
	pieces: PieceRow[];
	concerts: ConcertRow[];
}

/** Returns the first candidate whose normalised form is not taken yet, and takes it. */
function claim(candidates: string[], taken: Set<string>): string {
	const base = candidates[0];
	let choice = candidates.find((candidate) => !taken.has(normalize(candidate)));
	for (let n = 2; !choice; n++) {
		if (!taken.has(normalize(`${base} (${n})`))) choice = `${base} (${n})`;
	}
	taken.add(normalize(choice));
	return choice;
}

/**
 * Rows to append for Drive folders and confirmed calendar concerts the sheet doesn't
 * have yet. Piece names are made unique, since programme rows refer to pieces by name.
 */
export function planSync(
	repertoire: Repertoire,
	links: Links,
	drivePieces: DrivePiece[],
	calendarConcerts: CalendarConcert[],
	{ timeZone, orchestra }: { timeZone: string; orchestra?: string }
): SyncPlan {
	const pieceTitles = new Set(repertoire.piecesByTitle.keys());
	const pieces: PieceRow[] = drivePieces
		.filter((piece) => !links.pieceByFolder.has(piece.id))
		.map((piece) => ({
			title: claim(
				[piece.title, ...(piece.composer ? [`${piece.title} (${piece.composer})`] : []), `${piece.title} (${piece.folderName})`],
				pieceTitles
			),
			composer: piece.composer ?? '',
			catalogue: piece.catalogue ?? '',
			driveFolderId: piece.id
		}));

	// A concert is its name and its day: a name may come again on another day, not on the same one.
	const days = new Set(repertoire.concerts.map((concert) => concertKey(concert.title, concert.date ?? concert.dateText)));
	const concerts: ConcertRow[] = calendarConcerts
		.filter((event) => !event.tentative && !links.concertByEvent.has(event.id))
		.map((event) => {
			const day = eventDay(event, timeZone);
			const title = /\b(1[89]|20)\d\d\b/.test(event.displayTitle)
				? event.displayTitle
				: `${event.displayTitle} ${day.slice(0, 4)}`;
			let free = title;
			for (let n = 2; days.has(concertKey(free, day)); n++) free = `${title} (${n})`;
			days.add(concertKey(free, day));
			return {
				date: day,
				title: free,
				location: event.location ?? '',
				orchestra: orchestra ?? '',
				eventId: event.id
			};
		});

	return { pieces, concerts };
}

/** Puts values into the sheet's own column order; unknown columns stay empty. */
export function toSheetRow<K extends string, V extends string | boolean = string>(
	values: Partial<Record<K, V>>,
	indexes: Partial<Record<K, number>>
): (V | '')[] {
	const width = Math.max(-1, ...Object.values<number | undefined>(indexes).map((i) => i ?? -1)) + 1;
	const row = Array<V | ''>(width).fill('');
	for (const [key, value] of Object.entries(values) as [K, V | undefined][]) {
		const index = indexes[key];
		if (index !== undefined && value) row[index] = value;
	}
	return row;
}
