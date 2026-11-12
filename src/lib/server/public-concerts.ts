import { readState, recordIn, sortedByKey, stringsIn, writeState } from './app-state.ts';
import { isPastConcert, type Library, type LibraryConcert } from './library.ts';
import type { FeedEvent } from '#lib/events/ical.ts';
import { safeLink } from '#lib/links.ts';
import { slug } from '#lib/music/my-parts.ts';

/**
 * Concerts for the orchestra's own website (#197). The app stays members-only; the website
 * reads this feed instead of someone typing dates and programmes in twice. Only concerts an
 * organiser published on their page are in it, upcoming ones and, for the Chronik, past ones.
 * Nothing about members: date, place, orchestras, what is played, and what the organiser
 * wrote for the website.
 */

/** Bumped when a field changes meaning or goes away; new fields don't bump it. */
export const FEED_VERSION = 1;

/** A text in both languages a website may show; either may be missing. */
export interface Bilingual {
	de?: string;
	en?: string;
}

/** What an organiser adds for the website on the concert's page; every part is optional. */
export interface PublicDetails {
	/** A few sentences about the concert. */
	text?: Bilingual;
	/** Where to buy or reserve tickets; only http(s). */
	ticketUrl?: string;
	/** "Eintritt frei, Spenden erbeten" and the like. */
	ticketNote?: Bilingual;
}

export interface PublicConcert {
	id: string;
	/** For the website's address, e.g. "herbstkonzert-2026"; unique in the feed, changes with the title. */
	slug: string;
	title: string;
	/** "2026-12-13", "1957-12" or "1957": as exact as the date is known. */
	date: string;
	/** "Sonntag, 13. Dezember 2026", "Dezember 1957" … in the deployment's language. */
	dateText: string;
	/** From the calendar, for upcoming concerts and recent ones still in it. */
	start?: string;
	end?: string;
	allDay?: boolean;
	location?: string;
	/** Our own orchestras' short names. */
	orchestras: string[];
	/** Choirs and orchestras we give it with; a program item names them by `shortName` under `orchestra`. */
	partners: PublicPartner[];
	/** Who organises it, when it isn't us; then tickets are sold there (`ticketUrl`), never through /api/karten. */
	organizer?: { name: string; website?: string };
	/** `orchestra`: "EO", "KCH", or "EO, KCH" for what we play together. */
	program: { title: string; composer?: string; orchestra?: string }[];
	text?: Bilingual;
	ticketUrl?: string;
	ticketNote?: Bilingual;
	/** Tickets can be reserved through /api/karten/<id>; only on upcoming concerts. */
	tickets?: boolean;
}

/** A guest choir or orchestra from the "Ensembles" tab; only what it would show on its own site. */
export interface PublicPartner {
	/** "KCH": how program items name it. */
	shortName: string;
	/** "Kammerchor Unna". */
	name: string;
	/** "Chor", "Orchester" … as entered. */
	kind?: string;
	conductor?: string;
	website?: string;
	/** An https image link. */
	logo?: string;
}

export interface PublicFeed {
	upcoming: PublicConcert[];
	/** Newest first. */
	past: PublicConcert[];
}

/** Concert ids, kept with the app's own state, not in the sheet: publishing is the app's business. */
const KEY = 'public-concerts';
/** Texts, ticket links and notes by concert id, kept next to the published ids. */
const DETAILS_KEY = 'public-concert-details';
const TEXT_MAX = 2000;
const NOTE_MAX = 200;

const storedIds = () => readState(KEY, (value) => new Set(stringsIn(value)));
const storedDetails = () => readState(DETAILS_KEY, (value) => new Map(Object.entries(recordIn<PublicDetails>(value))));

export const publishedIds = (): Promise<Set<string>> => storedIds().catch(() => new Set<string>());

export async function setPublished(id: string, published: boolean): Promise<void> {
	const ids = await storedIds();
	if (published) ids.add(id);
	else ids.delete(id);
	await writeState(KEY, [...ids].sort());
}

export const publicDetails = (): Promise<Map<string, PublicDetails>> => storedDetails().catch(() => new Map<string, PublicDetails>());

/** Saves a concert's details; empty details remove the entry. Kept when the concert is withdrawn. */
export async function setPublicDetails(id: string, details: PublicDetails): Promise<void> {
	const all = await storedDetails();
	if (Object.keys(details).length) all.set(id, details);
	else all.delete(id);
	await writeState(DETAILS_KEY, sortedByKey(all));
}

const field = (form: FormData, name: string, max: number) => String(form.get(name) ?? '').trim().slice(0, max) || undefined;

function bilingual(de: string | undefined, en: string | undefined): Bilingual | undefined {
	return de || en ? { ...(de ? { de } : {}), ...(en ? { en } : {}) } : undefined;
}

/** The details form on a concert's page; a ticket link that isn't http(s) is reported, not saved. */
export function readDetails(form: FormData): { details: PublicDetails; badLink: boolean } {
	const link = field(form, 'ticketUrl', 500);
	const ticketUrl = link ? safeLink(link) : undefined;
	const text = bilingual(field(form, 'textDe', TEXT_MAX), field(form, 'textEn', TEXT_MAX));
	const ticketNote = bilingual(field(form, 'ticketNoteDe', NOTE_MAX), field(form, 'ticketNoteEn', NOTE_MAX));
	return {
		details: { ...(text ? { text } : {}), ...(ticketUrl ? { ticketUrl } : {}), ...(ticketNote ? { ticketNote } : {}) },
		badLink: !!link && !ticketUrl
	};
}

/** "Herbstkonzert" on 2026-11-15 → "herbstkonzert-2026"; the year only when the title lacks it. */
export function concertSlug(title: string, date: string): string {
	const base = slug(title) || 'konzert';
	const year = date.slice(0, 4);
	return /^\d{4}$/.test(year) && !base.split('-').includes(year) ? `${base}-${year}` : base;
}

type Unslugged = Omit<PublicConcert, 'slug'>;

function publicConcert(concert: LibraryConcert, library: Library, details: PublicDetails = {}): Unslugged {
	const event = concert.event;
	return {
		id: concert.id,
		title: event?.displayTitle ?? concert.title,
		date: event ? event.start.slice(0, 10) : concert.dateKey,
		dateText: concert.label?.long ?? concert.dateText ?? '',
		...(event ? { start: event.start, end: event.end, allDay: event.allDay } : {}),
		location: event?.location || concert.location || undefined,
		orchestras: concert.orchestras,
		partners: concert.partners.map((partner) => ({ ...partner })),
		...(concert.organizer ? { organizer: { name: concert.organizer.name, ...(concert.organizer.website ? { website: concert.organizer.website } : {}) } } : {}),
		program: concert.program.map((item) => {
			// A guest piece names its composer on its row, ours in "Stücke".
			const composer = item.composer ?? (item.pieceId ? library.piecesById.get(item.pieceId)?.composer : undefined);
			return { title: item.title, ...(composer ? { composer } : {}), ...(item.orchestra ? { orchestra: item.orchestra } : {}) };
		}),
		...details
	};
}

/** The published concerts, upcoming soonest first and past newest first. */
export function publicFeed(library: Library, published: Set<string>, details = new Map<string, PublicDetails>()): PublicFeed {
	const concerts = [...published].map((id) => library.concertsById.get(id)).filter((concert) => !!concert);
	const byDate = (a: Unslugged, b: Unslugged) => (a.start ?? a.date).localeCompare(b.start ?? b.date);
	// Oldest first, so a concert keeps its slug when later ones with the same name are published.
	const taken = new Set<string>();
	const all = concerts
		.map((concert) => publicConcert(concert, library, details.get(concert.id)))
		.sort(byDate)
		.map((concert): PublicConcert => {
			const base = concertSlug(concert.title, concert.date);
			let candidate = base;
			for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
			taken.add(candidate);
			return { ...concert, slug: candidate };
		});
	const past = new Set(concerts.filter((concert) => isPastConcert(concert, library.today)).map((concert) => concert.id));
	return {
		upcoming: all.filter((concert) => !past.has(concert.id)),
		past: all.filter((concert) => past.has(concert.id)).reverse()
	};
}

/** The upcoming ones for calendar apps; past concerts without a time from the calendar can't be events. */
export function feedEventsOf(feed: PublicFeed, programLabel: string, withLabel: (names: string[]) => string = (names) => names.join(', ')): FeedEvent[] {
	return feed.upcoming
		.filter((concert) => concert.start && concert.end)
		.map((concert) => ({
			uid: `${concert.id}@sheetmanagement-public`,
			title: concert.title,
			start: concert.start!,
			end: concert.end!,
			allDay: !!concert.allDay,
			location: concert.location,
			description:
				[
					concert.partners.length ? withLabel(concert.partners.map((partner) => partner.name)) : '',
					concert.program.length ? `${programLabel}\n${concert.program.map((item) => (item.composer ? `${item.composer}: ${item.title}` : item.title)).join('\n')}` : ''
				]
					.filter(Boolean)
					.join('\n\n') || undefined
		}));
}
