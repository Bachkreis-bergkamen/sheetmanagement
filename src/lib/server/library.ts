import { accessFor, normalizeEmail, seesDate, type Access } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import type { ShownEvent } from '#lib/events/schedule.ts';
import type { Catalog } from '#lib/music/catalog.ts';
import { searchText } from '#lib/music/text.ts';
import type { PieceDetail, PieceStatus, PieceSummary } from '#lib/music/types.ts';
import { eventDay, formatFuzzyDate, fuzzyDateKey, parseFuzzyDate, type FuzzyDate, type FuzzyDateLabel } from '#lib/repertoire/dates.ts';
import { onlyGuests, performerNames, type Ensemble } from '#lib/repertoire/ensembles.ts';
import type { ReportPiece } from '#lib/repertoire/music-report.ts';
import { eventOrchestra, isJoint, playedBy, sameOrchestra } from '#lib/repertoire/orchestras.ts';
import { normalize, type SheetConcert, type SheetPiece } from '#lib/repertoire/sheet.ts';
import { getCatalog } from './catalog.ts';
import { getAccessList, getRepertoire, type RepertoireResult } from './repertoire.ts';
import { getSchedule, type ScheduleResult } from './schedule.ts';

export interface LibraryPiece extends PieceSummary {
	/** Parts and folder, for pieces with sheet music in Drive. */
	detail?: PieceDetail;
	sheet?: SheetPiece;
	/** Ids of the concerts it was played at, oldest first. */
	playedAt: string[];
}

export interface ProgramItem {
	position?: number;
	title: string;
	subtitle?: string;
	/** Link target, when the name matches a piece. */
	pieceId?: string;
	status?: PieceStatus;
	notes?: string;
	/** Seconds, from the piece's "Dauer". */
	duration?: number;
	/** Which of the concert's orchestras plays it; guest ensembles by their short name. */
	orchestra?: string;
	/** From the programme row, for pieces guests bring that aren't in "Stücke". */
	composer?: string;
	arranger?: string;
	publisher?: string;
}

export interface LibraryConcert {
	/** The calendar event id when there is one, so /kalender/[id] stays the same. */
	id: string;
	title: string;
	date: FuzzyDate | null;
	/** Sortable "1957-12", empty when unknown (sorts last, newest first). */
	dateKey: string;
	label: FuzzyDateLabel | null;
	/** As entered in the sheet, for dates that couldn't be read. */
	dateText?: string;
	location?: string;
	/** As entered, e.g. "EO, A". */
	orchestra?: string;
	/** Each with its own programme; empty when the sheet names none. */
	orchestras: string[];
	/** Guest choirs and orchestras ("Mitwirkende"). */
	partners: Ensemble[];
	/** Who organises and sells the tickets, when it isn't us ("Veranstalter"). */
	organizer?: Ensemble;
	event?: ShownEvent;
	sheet?: SheetConcert;
	program: ProgramItem[];
	/** The concert whose programme this one plays ("Programm wie" in the sheet). */
	sharedFrom?: { id: string; title: string };
	/** Concerts that play this one's programme. */
	sharedWith: { id: string; title: string }[];
}

export type SheetState = 'ok' | Extract<RepertoireResult, { ok: false }>['reason'];

export interface Library {
	catalog: { ok: true; catalog: Catalog } | { ok: false; reason: 'not-configured' | 'failed' };
	schedule: ScheduleResult;
	sheet: SheetState;
	pieces: LibraryPiece[];
	piecesById: Map<string, LibraryPiece>;
	/** Pieces by their normalised title in "Stücke", for names entered in other tabs. */
	piecesByName: Map<string, LibraryPiece>;
	/** Newest first. */
	concerts: LibraryConcert[];
	concertsById: Map<string, LibraryConcert>;
	/** Choirs and orchestras from the "Ensembles" tab. */
	ensembles: Ensemble[];
	/** Today in the orchestra's time zone, e.g. "2026-10-18". */
	today: string;
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

let memo: { today: string; sources: unknown[]; library: Library } | undefined;

const libraryDay = (now: number) => eventDay({ start: new Date(now).toISOString(), allDay: false }, config.timeZone);

/**
 * Drive archive, calendar and Repertoire sheet combined, as the pages show them. Building it
 * costs real CPU (hundreds of pieces and concerts), so it is reused across requests while the
 * cached sources are the same, against Error 1102.
 */
export async function getLibrary(now = Date.now()): Promise<Library> {
	const [catalog, schedule, repertoire] = await Promise.all([getCatalog(), getSchedule(now), getRepertoire()]);
	const sources = [
		catalog.ok ? catalog.catalog : catalog.reason,
		schedule.ok ? schedule.snapshot : schedule.reason,
		repertoire.ok ? repertoire.repertoire : repertoire.reason,
		repertoire.ok ? repertoire.links : undefined
	];
	// The library only depends on the time through its day ("past", "in 3 Tagen"), so it is kept
	// for the whole day while the sources stay the same, not rebuilt every minute.
	const today = libraryDay(now);
	if (memo && memo.today === today && sources.every((source, i) => source === memo!.sources[i])) return memo.library;
	const library = buildLibrary(now, catalog, schedule, repertoire);
	memo = { today, sources, library };
	return library;
}

function buildLibrary(
	now: number,
	catalog: Awaited<ReturnType<typeof getCatalog>>,
	schedule: ScheduleResult,
	repertoire: RepertoireResult
): Library {
	const today = libraryDay(now);
	const sheet = repertoire.ok ? repertoire.repertoire : undefined;
	const links = repertoire.ok ? repertoire.links : undefined;

	// Pieces: everything in Drive, with names corrected in the sheet, plus sheet-only pieces.
	const pieces: LibraryPiece[] = [];
	const idBySheetKey = new Map<string, string>();
	for (const detail of catalog.ok ? catalog.catalog.pieces : []) {
		const row = links?.pieceByFolder.get(detail.id);
		if (row) idBySheetKey.set(row.key, detail.id);
		const title = row?.title || detail.title;
		const composer = row?.composer ?? detail.composer;
		const catalogue = row?.catalogue ?? detail.catalogue;
		pieces.push({
			...summary(detail),
			title,
			composer,
			catalogue,
			search: searchText(title, composer, catalogue, row?.arranger, row?.genre, detail.search),
			detail,
			sheet: row,
			playedAt: []
		});
	}
	for (const row of sheet?.pieces ?? []) {
		if (idBySheetKey.has(row.key) || row.driveFolderId || !row.title) continue;
		idBySheetKey.set(row.key, row.key);
		pieces.push({
			id: row.key,
			title: row.title,
			composer: row.composer,
			catalogue: row.catalogue,
			programs: [],
			partCount: 0,
			status: 'none',
			search: searchText(row.title, row.composer, row.catalogue, row.arranger, row.genre),
			sheet: row,
			playedAt: []
		});
	}
	pieces.sort((a, b) => collator.compare(a.title, b.title));
	const piecesById = new Map(pieces.map((piece) => [piece.id, piece]));
	const piecesByName = new Map(pieces.flatMap((piece) => (piece.sheet?.title ? [[normalize(piece.sheet.title), piece] as const] : [])));

	// Concerts: every row in the sheet, plus calendar concerts not in it (yet).
	const events = schedule.ok ? schedule.byId : new Map<string, ShownEvent>();
	const concerts: LibraryConcert[] = [];
	for (const row of sheet?.concerts ?? []) {
		const eventId = links?.eventByConcert.get(row.key) ?? row.eventId;
		const event = eventId ? events.get(eventId) : undefined;
		concerts.push(
			concert({
				// An id from the sheet whose event is gone (or outside the loaded range) keeps it,
				// so links stay stable; the page then shows the sheet's data.
				id: eventId ?? row.key,
				title: event?.displayTitle ?? row.title,
				date: event ? eventDate(event) : row.date,
				dateText: row.dateText,
				location: event?.location ?? row.location,
				orchestra: row.orchestra,
				orchestras: row.orchestras,
				partners: row.partners,
				...(row.organizer ? { organizer: row.organizer } : {}),
				event,
				sheet: row,
				program: row.program.map((entry) => {
					const piece = entry.pieceKey ? piecesById.get(idBySheetKey.get(entry.pieceKey) ?? '') : undefined;
					return {
						position: entry.position,
						title: piece?.title ?? entry.pieceName,
						subtitle: piece ? [piece.composer, piece.catalogue].filter(Boolean).join(' · ') || undefined : entry.composer,
						pieceId: piece?.id,
						status: piece?.status,
						notes: entry.notes,
						// The row's own details win: a guest may play another arrangement than ours.
						duration: entry.duration ?? piece?.sheet?.duration,
						orchestra: entry.orchestra,
						...(entry.composer ? { composer: entry.composer } : {}),
						...(entry.arranger ? { arranger: entry.arranger } : {}),
						...(entry.publisher ? { publisher: entry.publisher } : {})
					};
				})
			})
		);
	}
	const known = new Set(concerts.map((c) => c.id));
	for (const event of events.values()) {
		if (event.type !== 'konzert' || known.has(event.id)) continue;
		concerts.push(
			concert({ id: event.id, title: event.displayTitle, date: eventDate(event), location: event.location, orchestras: [], partners: [], event, program: [] })
		);
	}
	concerts.sort((a, b) => b.dateKey.localeCompare(a.dateKey) || collator.compare(a.title, b.title));
	const concertsById = new Map(concerts.map((c) => [c.id, c]));

	// Shared programmes, both ways, oldest sharing concert first.
	const bySheetKey = new Map(concerts.flatMap((c) => (c.sheet ? [[c.sheet.key, c] as const] : [])));
	for (const c of [...concerts].reverse()) {
		const source = c.sheet?.programFrom ? bySheetKey.get(c.sheet.programFrom) : undefined;
		if (!source) continue;
		c.sharedFrom = { id: source.id, title: source.title };
		source.sharedWith.push({ id: c.id, title: c.title });
	}

	// "Gespielt bei", oldest first.
	for (const c of [...concerts].reverse()) {
		for (const item of c.program) {
			const piece = item.pieceId ? piecesById.get(item.pieceId) : undefined;
			if (piece && !piece.playedAt.includes(c.id)) piece.playedAt.push(c.id);
		}
	}

	return {
		catalog: catalog.ok ? { ok: true, catalog: catalog.catalog } : catalog,
		schedule,
		sheet: repertoire.ok ? 'ok' : repertoire.reason,
		pieces,
		piecesById,
		piecesByName,
		concerts,
		concertsById,
		ensembles: sheet?.ensembles ?? [],
		today
	};
}

function summary({ id, title, composer, catalogue, category, programs, partCount, status, search }: PieceDetail): PieceSummary {
	return { id, title, composer, catalogue, category, programs, partCount, status, search };
}

function eventDate(event: ShownEvent): FuzzyDate {
	return parseFuzzyDate(eventDay(event, config.timeZone))!;
}

function concert(input: Omit<LibraryConcert, 'dateKey' | 'label' | 'sharedWith'>): LibraryConcert {
	return {
		...input,
		sharedWith: [],
		dateKey: input.date ? fuzzyDateKey(input.date) : '',
		label: input.date ? formatFuzzyDate(input.date, config.locale) : null
	};
}

/** Whether a concert is over: a calendar event once it ended, a sheet date once its day (month, year) is past. */
export function isPastConcert(concert: LibraryConcert, today: string): boolean {
	if (concert.event) return concert.event.past;
	if (!concert.date) return true;
	return concert.dateKey < today.slice(0, concert.dateKey.length);
}

export interface OrchestraProgram {
	/** Undefined for a concert that names no orchestra; "EO, A" for what they play together. */
	orchestra?: string;
	/** Played together by several orchestras: it's in each one's Drive folder. */
	joint: boolean;
	items: ProgramItem[];
}

/**
 * The programme per orchestra, in the order the concert names them; an orchestra without
 * pieces yet is there too, so it can get some. One entry for a concert of one orchestra.
 * Guest ensembles follow ours; pieces played together ("EO, A") come after, once they are there.
 */
export function programsOf(concert: Pick<LibraryConcert, 'orchestras' | 'program'> & { partners?: Ensemble[] }): OrchestraProgram[] {
	const guests = concert.orchestras.length ? (concert.partners ?? []).map((partner) => partner.shortName) : [];
	const named = concert.orchestras.length ? [...concert.orchestras, ...guests] : [undefined];
	const others = [...new Set(concert.program.map((item) => item.orchestra))].filter(
		(orchestra) => !named.some((name) => sameOrchestra(name, orchestra))
	);
	return [...named, ...others].map((orchestra) => ({
		orchestra,
		joint: isJoint(orchestra),
		items: concert.program.filter((item) => sameOrchestra(item.orchestra, orchestra))
	}));
}

/**
 * What one orchestra plays: its own programme and the pieces it plays together with others;
 * the whole programme when the concert has just one.
 */
export function programOf(concert: Pick<LibraryConcert, 'orchestras' | 'program'>, orchestra: string | undefined): ProgramItem[] {
	return concert.program.filter((item) => playedBy(item.orchestra, orchestra));
}

/** The orchestras a date is for (see eventOrchestra): undefined is everyone. */
export const orchestraOf = (library: Pick<Library, 'concertsById'>, event: Parameters<typeof eventOrchestra>[0]) =>
	eventOrchestra(event, (id) => library.concertsById.get(id)?.orchestra);

/**
 * The access on one date's pages (#305), by its id: a role limited to some orchestras holds there
 * only for their dates. A concert only in the archive goes by its orchestra. While the dates
 * can't be read, the limited rights hold nowhere.
 */
export async function accessForDate(access: Access, id: string): Promise<Access> {
	if (!access.scopes?.size) return access;
	try {
		const library = await getLibrary();
		const event = library.schedule.ok ? library.schedule.byId.get(id) : undefined;
		return accessFor(access, event ? orchestraOf(library, event) : library.concertsById.get(id)?.orchestra);
	} catch {
		const scopes = access.scopes;
		return { ...access, rights: new Set([...access.rights].filter((right) => !scopes.has(right))), everywhere: access.rights };
	}
}

/**
 * Which dates the pages show the viewer: a member only the rehearsals of their orchestras
 * (see seesDate); those who plan dates, and anyone not in "Mitglieder", see them all.
 */
export async function shownDates(library: Pick<Library, 'concertsById'>, locals: App.Locals): Promise<(event: ShownEvent) => boolean> {
	const user = locals.access.user;
	if (!user || locals.access.rights.has('termine.planen')) return () => true;
	const member = (await getAccessList().catch(() => null))?.membersByEmail.get(normalizeEmail(user.email));
	return (event) => seesDate(member, event, orchestraOf(library, event));
}

/** A piece named in another tab (e.g. "Proben") as the pages show it. */
export function namedItem(library: Library, name: string, notes?: string): ProgramItem {
	const piece = library.piecesByName.get(normalize(name));
	return {
		title: piece?.title ?? name,
		subtitle: piece ? [piece.composer, piece.catalogue].filter(Boolean).join(' · ') || undefined : undefined,
		pieceId: piece?.id,
		status: piece?.status,
		notes,
		duration: piece?.sheet?.duration
	};
}

/**
 * Which pieces of a concert with guests go into its music list: all of them when we organise
 * it, only ours when a guest does and reports theirs. Organisers can change it per concert.
 */
export type ReportScope = 'all' | 'ours';

export const defaultReportScope = (concert: Pick<LibraryConcert, 'organizer'>): ReportScope => (concert.organizer ? 'ours' : 'all');

/**
 * A concert's programme as the music list for the collecting society needs it (#118). With
 * guests, each piece says who performs it, and the guests' pieces bring their own details.
 */
export function reportPieces(library: Library, concert: LibraryConcert, scope: ReportScope = 'all'): ReportPiece[] {
	const withPartners = concert.partners.length > 0;
	return concert.program
		.filter((item) => scope === 'all' || !onlyGuests(item.orchestra, concert.partners))
		.map((item) => {
			const piece = item.pieceId ? library.piecesById.get(item.pieceId) : undefined;
			// A row naming no orchestra, of a concert naming none, is ours.
			const performers = withPartners ? performerNames(item.orchestra ?? config.shortName, concert.partners) : [];
			return {
				pieceId: item.pieceId,
				title: item.title,
				composer: item.composer ?? piece?.composer,
				// A guest piece's row names its composer in full, as the editor asks for it.
				composerFull: item.composer ?? piece?.sheet?.composerFull,
				arranger: item.arranger ?? piece?.sheet?.arranger,
				publisher: item.publisher ?? piece?.sheet?.publisher,
				duration: item.duration,
				...(withPartners ? { performers: performers.join(', ') } : {})
			};
		});
}

/** Only what a concert list shows. */
export function concertSummary(concert: LibraryConcert) {
	return {
		id: concert.id,
		title: concert.title,
		label: concert.label,
		dateText: concert.dateText,
		location: concert.location,
		programCount: concert.program.length,
		inCalendar: !!concert.event
	};
}
export type ConcertSummary = ReturnType<typeof concertSummary>;
