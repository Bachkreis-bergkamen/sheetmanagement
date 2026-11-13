import { cleanLink } from '#lib/links.ts';
import { t } from '#lib/i18n/index.ts';
import { searchText } from '#lib/music/text.ts';
import { ConcertNames, concertKey } from './concert-ref.ts';
import { fuzzyDateKey, parseFuzzyDate, type FuzzyDate } from './dates.ts';
import { parseDuration } from './duration.ts';
import { concertPartners, readEnsembles, withGuests, type Ensemble } from './ensembles.ts';
import { concertOrchestras, rowOrchestra, sameOrchestra } from './orchestras.ts';

/** Tab and column names of the Repertoire sheet, in the order /setup creates them. */
export const LAYOUT = t.sheet;
export type TabKey = keyof typeof LAYOUT;
/** The tabs the app can't work without; the access tabs (members, rights …) are optional. */
export const REPERTOIRE_TABS = ['pieces', 'concerts', 'program'] as const;
export type RepertoireTab = (typeof REPERTOIRE_TABS)[number];
export type ColumnKey<T extends TabKey> = keyof (typeof LAYOUT)[T]['columns'];
/** Columns added later that an older sheet works without, so they aren't reported missing. */
const OPTIONAL_COLUMNS: Partial<Record<RepertoireTab, string[]>> = {
	pieces: ['duration', 'publisher', 'composerFull', 'instrumentation', 'contents'],
	concerts: ['sameProgramAs', 'partners', 'organizer'],
	program: ['orchestra', 'composer', 'arranger', 'publisher', 'duration']
};

/** The raw cell values of the repertoire tabs, header row included; "Ensembles" when the sheet has it. */
export type SheetValues = Record<RepertoireTab, string[][]> & { ensembles?: string[][] };

export interface TableRow<K extends string> {
	/** Row number in the sheet, starting at 1 for the header. */
	row: number;
	values: Record<K, string>;
}

export interface Table<K extends string> {
	rows: TableRow<K>[];
	/** Column keys whose header was not found. */
	missing: K[];
	/** Column index per key, for writing rows in the sheet's own column order. */
	indexes: Partial<Record<K, number>>;
	/** Number of header cells, so new columns can be added after them. */
	width: number;
}

/** Headers are matched ignoring case, accents and surrounding spaces. */
export const normalize = (text: string) => searchText(text.replace(/\s+/g, ' ').trim());

/** "keins" in "Hörbeispiel": the piece has no recording, and that's known. */
export const isNoRecording = (text: string) => !!text.trim() && normalize(text) === normalize(t.sheetValues.noRecording);

/** Reads a tab by its header row, so columns can be in any order. Empty rows are skipped. */
export function readTable<K extends string>(values: string[][], columns: Record<K, string>): Table<K> {
	const header = (values[0] ?? []).map(normalize);
	const indexes: Partial<Record<K, number>> = {};
	const missing: K[] = [];
	for (const [key, name] of Object.entries(columns) as [K, string][]) {
		const index = header.indexOf(normalize(name));
		if (index === -1) missing.push(key);
		else indexes[key] = index;
	}

	const rows: TableRow<K>[] = [];
	values.slice(1).forEach((cells, i) => {
		const row = {} as Record<K, string>;
		let empty = true;
		for (const key of Object.keys(columns) as K[]) {
			const index = indexes[key];
			const value = index === undefined ? '' : String(cells[index] ?? '').trim();
			row[key] = value;
			// An unticked checkbox reads as FALSE: a row with nothing else in it is an empty row.
			if (value && value.toUpperCase() !== 'FALSE') empty = false;
		}
		if (!empty) rows.push({ row: i + 2, values: row });
	});
	return { rows, missing, indexes, width: values[0]?.length ?? 0 };
}

export interface SheetPiece {
	row: number;
	/** Stable key: the Drive folder id, or "s-<title>" for pieces without sheet music. */
	key: string;
	title: string;
	composer?: string;
	/** "Ludwig van Beethoven", for the GEMA list (#146); "Komponist" may say only "Beethoven". */
	composerFull?: string;
	catalogue?: string;
	arranger?: string;
	genre?: string;
	difficulty?: string;
	notes?: string;
	reviewedAt?: string;
	/** A link to listen to, e.g. on YouTube; only http(s). */
	recording?: string;
	/** "keins" in the column: there is no recording to find. */
	noRecording?: boolean;
	/** In seconds, read from "Dauer"; undefined when empty or unreadable. */
	duration?: number;
	publisher?: string;
	/** The instruments the score is written for (#249), as written: "Flöte 1 & 2; Oboe". */
	instrumentation?: string;
	/** A medley's songs, one per line: "Habanera – Bizet" (contents.ts). */
	contents?: string;
	driveFolderId?: string;
}

export interface ProgramEntry {
	row: number;
	position?: number;
	/** Key of the piece, if the name matches a row in "Stücke". */
	pieceKey?: string;
	/** The name as entered. */
	pieceName: string;
	notes?: string;
	/** Which of the concert's orchestras plays it; undefined when the concert names none. Guests by short name. */
	orchestra?: string;
	/** For a guest piece that isn't in "Stücke": what the GEMA list needs, from the row itself. */
	composer?: string;
	arranger?: string;
	publisher?: string;
	/** Seconds. */
	duration?: number;
}

export interface SheetConcert {
	row: number;
	/** Stable key: the calendar event id, or "s-<Anlass>" for concerts only in the sheet. */
	key: string;
	title: string;
	/** How other rows name it: "Anlass", with the date when another concert has the same name. */
	ref: string;
	date: FuzzyDate | null;
	/** As entered, shown when it can't be read as a date. */
	dateText: string;
	location?: string;
	/** As entered, e.g. "EO, A". */
	orchestra?: string;
	/** "EO, A" → ["EO", "A"]: each has its own programme. */
	orchestras: string[];
	/** Guest choirs and orchestras ("Mitwirkende"), in the order the concert names them. */
	partners: Ensemble[];
	/** Who organises and sells the tickets when it isn't us ("Veranstalter"). */
	organizer?: Ensemble;
	eventId?: string;
	/** "Programm wie" as entered: the concert whose programme this one plays too. */
	sameProgramAs?: string;
	/** Key of the concert the programme comes from, when it's shared and not its own. */
	programFrom?: string;
	/** In programme order; entries without a number keep their row order at the end. */
	program: ProgramEntry[];
}

export type ProblemKind =
	| 'missing-column'
	| 'duplicate-piece'
	| 'duplicate-concert'
	| 'unknown-piece'
	| 'unknown-concert'
	| 'ambiguous-concert'
	| 'bad-date'
	| 'duplicate-member'
	| 'unknown-right';

export interface Problem {
	kind: ProblemKind;
	tab: string;
	row?: number;
	/** The name or value concerned. */
	value: string;
}

export interface Repertoire {
	pieces: SheetPiece[];
	concerts: SheetConcert[];
	/** From the "Ensembles" tab; empty without it. */
	ensembles: Ensemble[];
	piecesByKey: Map<string, SheetPiece>;
	piecesByFolder: Map<string, SheetPiece>;
	/** Pieces by normalised title, for matching programme rows. */
	piecesByTitle: Map<string, SheetPiece>;
	concertsByKey: Map<string, SheetConcert>;
	concertsByEvent: Map<string, SheetConcert>;
	/** Finds a concert by the text other rows name it with (see concert-ref.ts). */
	concertNames: ConcertNames<SheetConcert>;
	/** Concert keys per piece key, in date order. */
	playedAt: Map<string, string[]>;
	tables: { [K in RepertoireTab]: Table<ColumnKey<K> & string> };
	problems: Problem[];
}

const slug = (text: string) =>
	normalize(text)
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'x';

/** Adds "-2", "-3" … until the key is free. */
function uniqueKey(key: string, taken: Map<string, unknown>): string {
	let candidate = key;
	for (let n = 2; taken.has(candidate); n++) candidate = `${key}-${n}`;
	return candidate;
}

const optional = (value: string) => value || undefined;

export function buildRepertoire(values: SheetValues): Repertoire {
	const problems: Problem[] = [];
	const tables = {
		pieces: readTable(values.pieces, LAYOUT.pieces.columns),
		concerts: readTable(values.concerts, LAYOUT.concerts.columns),
		program: readTable(values.program, LAYOUT.program.columns)
	};
	for (const key of REPERTOIRE_TABS) {
		for (const column of tables[key].missing) {
			if (OPTIONAL_COLUMNS[key]?.includes(column)) continue;
			const name = (LAYOUT[key].columns as Record<string, string>)[column];
			problems.push({ kind: 'missing-column', tab: LAYOUT[key].tab, value: name });
		}
	}

	// Pieces. A Drive folder listed twice: the first row wins.
	const pieces: SheetPiece[] = [];
	const piecesByKey = new Map<string, SheetPiece>();
	const piecesByFolder = new Map<string, SheetPiece>();
	const piecesByTitle = new Map<string, SheetPiece>();
	for (const { row, values: v } of tables.pieces.rows) {
		if (!v.title && !v.driveFolderId) continue;
		const folder = v.driveFolderId;
		if (folder && piecesByFolder.has(folder)) {
			problems.push({ kind: 'duplicate-piece', tab: LAYOUT.pieces.tab, row, value: v.title || folder });
			continue;
		}
		const piece: SheetPiece = {
			row,
			key: folder || uniqueKey(`s-${slug(v.title)}`, piecesByKey),
			title: v.title,
			composer: optional(v.composer),
			composerFull: optional(v.composerFull),
			catalogue: optional(v.catalogue),
			arranger: optional(v.arranger),
			genre: optional(v.genre),
			difficulty: optional(v.difficulty),
			notes: optional(v.notes),
			reviewedAt: optional(v.reviewedAt),
			recording: cleanLink(v.recording),
			noRecording: isNoRecording(v.recording) || undefined,
			duration: parseDuration(v.duration),
			publisher: optional(v.publisher),
			instrumentation: optional(v.instrumentation),
			contents: optional(v.contents),
			driveFolderId: optional(folder)
		};
		pieces.push(piece);
		piecesByKey.set(piece.key, piece);
		if (folder) piecesByFolder.set(folder, piece);
		if (v.title) {
			const title = normalize(v.title);
			if (piecesByTitle.has(title)) {
				problems.push({ kind: 'duplicate-piece', tab: LAYOUT.pieces.tab, row, value: v.title });
			} else piecesByTitle.set(title, piece);
		}
	}

	const ensembles = readEnsembles(readTable(values.ensembles ?? [], LAYOUT.ensembles.columns).rows.map((row) => row.values));

	// Concerts: a name and a day. Two concerts may share a name ("Weihnachtskonzert") on other days;
	// other rows then name them with the date (concert-ref.ts).
	const concerts: SheetConcert[] = [];
	const concertsByKey = new Map<string, SheetConcert>();
	const concertsByEvent = new Map<string, SheetConcert>();
	const named = new Set<string>();
	for (const { row, values: v } of tables.concerts.rows) {
		if (!v.title && !v.eventId) continue;
		const event = v.eventId;
		const date = v.date ? parseFuzzyDate(v.date) : null;
		const nameAndDay = v.title.trim() ? concertKey(v.title, date ?? v.date) : '';
		if ((event && concertsByEvent.has(event)) || (nameAndDay && named.has(nameAndDay))) {
			problems.push({ kind: 'duplicate-concert', tab: LAYOUT.concerts.tab, row, value: v.title || event });
			continue;
		}
		if (v.date && !date) problems.push({ kind: 'bad-date', tab: LAYOUT.concerts.tab, row, value: v.date });
		const base = `s-${slug(v.title)}`;
		const concert: SheetConcert = {
			row,
			// The first with a name keeps the key it always had; another on another day gets its date.
			key: event || uniqueKey(concertsByKey.has(base) && date ? `${base}-${fuzzyDateKey(date)}` : base, concertsByKey),
			title: v.title,
			ref: v.title,
			date,
			dateText: v.date,
			location: optional(v.location),
			orchestra: optional(v.orchestra),
			orchestras: concertOrchestras(v.orchestra),
			partners: concertPartners(v.partners, ensembles),
			...(v.organizer ? { organizer: concertPartners(v.organizer, ensembles)[0] } : {}),
			eventId: optional(event),
			sameProgramAs: optional(v.sameProgramAs),
			program: []
		};
		concerts.push(concert);
		concertsByKey.set(concert.key, concert);
		if (event) concertsByEvent.set(event, concert);
		if (nameAndDay) named.add(nameAndDay);
	}
	const concertNames = new ConcertNames(concerts);
	for (const concert of concerts) concert.ref = concertNames.ref(concert);

	// Programme rows.
	for (const { row, values: v } of tables.program.rows) {
		if (!v.concert && !v.piece) continue;
		const concert = concertNames.find(v.concert);
		if (!concert || concert === 'ambiguous') {
			problems.push({ kind: concert ? 'ambiguous-concert' : 'unknown-concert', tab: LAYOUT.program.tab, row, value: v.concert });
			continue;
		}
		const piece = v.piece ? piecesByTitle.get(normalize(v.piece)) : undefined;
		const orchestra = rowOrchestra(v.orchestra, concert.orchestras, concert.partners.map((partner) => partner.shortName));
		// What guests bring isn't in our archive; their rows say what the GEMA list needs themselves.
		const guest = withGuests(orchestra, concert.partners) || !!v.composer;
		if (v.piece && !piece && !guest) problems.push({ kind: 'unknown-piece', tab: LAYOUT.program.tab, row, value: v.piece });
		const position = Number.parseFloat(v.position.replace(',', '.'));
		const duration = parseDuration(v.duration);
		concert.program.push({
			row,
			position: Number.isFinite(position) ? position : undefined,
			pieceKey: piece?.key,
			pieceName: v.piece,
			notes: optional(v.notes),
			orchestra,
			...(v.composer ? { composer: v.composer } : {}),
			...(v.arranger ? { arranger: v.arranger } : {}),
			...(v.publisher ? { publisher: v.publisher } : {}),
			...(duration ? { duration } : {})
		});
	}

	// Shared programmes: a concert without rows of its own plays the one it names under
	// "Programm wie", e.g. the 2nd Weihnachtskonzert the 1st one's. Own rows win.
	const owners = new Set(concerts.filter((concert) => concert.program.length).map((concert) => concert.key));
	for (const concert of concerts) {
		if (!concert.sameProgramAs || owners.has(concert.key)) continue;
		let source = concertNames.get(concert.sameProgramAs);
		// A chain ("3. → 2. → 1.") is followed to the concert with the rows.
		for (const seen = new Set([concert.key]); source && !owners.has(source.key) && !seen.has(source.key); ) {
			seen.add(source.key);
			source = source.sameProgramAs ? concertNames.get(source.sameProgramAs) : undefined;
		}
		if (!source || source.key === concert.key) {
			problems.push({ kind: 'unknown-concert', tab: LAYOUT.concerts.tab, row: concert.row, value: concert.sameProgramAs });
			continue;
		}
		if (!owners.has(source.key)) continue;
		concert.programFrom = source.key;
		concert.program = source.program;
		// The same programme has the same guests, unless the concert names its own.
		if (!concert.partners.length) concert.partners = source.partners;
	}

	const playedAt = new Map<string, string[]>();
	const byDate = [...concerts].sort((a, b) =>
		(a.date ? fuzzyDateKey(a.date) : '~').localeCompare(b.date ? fuzzyDateKey(b.date) : '~')
	);
	for (const concert of byDate) {
		// Each orchestra's programme together, in the order the concert names them; guests after ours.
		const performers = [...concert.orchestras, ...concert.partners.map((partner) => partner.shortName)];
		const rank = (entry: ProgramEntry) => {
			const index = performers.findIndex((orchestra) => sameOrchestra(orchestra, entry.orchestra));
			return index === -1 ? performers.length : index;
		};
		concert.program.sort(
			(a, b) => rank(a) - rank(b) || (a.position ?? Infinity) - (b.position ?? Infinity) || a.row - b.row
		);
		for (const entry of concert.program) {
			if (!entry.pieceKey) continue;
			const list = playedAt.get(entry.pieceKey) ?? [];
			if (!list.includes(concert.key)) list.push(concert.key);
			playedAt.set(entry.pieceKey, list);
		}
	}

	return {
		pieces,
		concerts,
		ensembles,
		piecesByKey,
		piecesByFolder,
		piecesByTitle,
		concertsByKey,
		concertsByEvent,
		concertNames,
		playedAt,
		tables,
		problems
	};
}

/** A concert as the programme editor names and finds its rows (program-edit.ts). */
export function programConcert(repertoire: Pick<Repertoire, 'concertNames'>, concert: SheetConcert) {
	return { ref: concert.ref, matches: (text: string) => repertoire.concertNames.get(text)?.key === concert.key };
}

/** The concert's own row in "Konzerte": by its calendar event, else by its name and day. */
export function findConcertRow<K extends string>(
	table: Table<K>,
	concert: Pick<SheetConcert, 'title' | 'date' | 'dateText' | 'eventId'>
): TableRow<K> | undefined {
	const cells = (row: TableRow<K>) => row.values as Record<string, string>;
	if (concert.eventId) return table.rows.find((row) => cells(row).eventId === concert.eventId);
	const wanted = concertKey(concert.title, concert.date ?? concert.dateText);
	return table.rows.find((row) => !cells(row).eventId && concertKey(cells(row).title ?? '', cells(row).date ?? '') === wanted);
}
