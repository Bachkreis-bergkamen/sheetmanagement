import type { RolePreset } from '#lib/access/access.ts';
import type { SeatingOverrides } from '#lib/music/seating.ts';
import type { Look } from '#lib/branding.ts';
import type { Features } from '#lib/features.ts';

/**
 * Everything an orchestra adjusts to run this app lives in one OrchestraConfig.
 * Presets in ./presets are complete examples; copy one and change what differs.
 */

export type InstrumentFamily =
	| 'partitur'
	| 'holz'
	| 'blech'
	| 'schlagwerk'
	| 'tasten'
	| 'streicher'
	| 'gesang'
	| 'sonstige';

export interface Instrument {
	/** Name as used in file names, the sheet and the naming check, e.g. "Geige". */
	name: string;
	/**
	 * Shown in the app instead of the name, when the file names use a different word:
	 * "Bratsche" for files named "Viola", so the strings read Geige · Bratsche · Cello.
	 */
	label?: string;
	family: InstrumentFamily;
	/**
	 * Other spellings found in file names, e.g. ["Violine", "Violin"]. Matched as whole
	 * words, ignoring case, so "Alt-Sax" also matches "Alt Sax" and "AltSax".
	 */
	aliases?: string[];
	/**
	 * Specific instruments filed under this one, matched like aliases but kept in the
	 * part's name as a note, so they don't all end up with the same name: a "Triangle"
	 * part is "Percussion Triangle", next to "Percussion Low Drum".
	 */
	variants?: string[];
	/**
	 * A numbered voice in flexible arrangements ("Stimme 3 in B", "Part 2 Violin")
	 * rather than an instrument. Shown as "Stimme 3" with the instruments that follow.
	 */
	voice?: boolean;
	/**
	 * A generic part that names the instruments it holds after a colon: "Percussion I: Triangel
	 * & Becken", "Chor: Sopran & Alt". These are the instruments it may name; who plays one of
	 * them finds the part, and so does who plays the generic part.
	 */
	holds?: string[];
	/**
	 * One of the usual orchestra instruments, offered first in instrument lists; the rest
	 * are behind "Mehr Instrumente …". When no instrument has it, every one is offered.
	 */
	common?: boolean;
}

export interface NamingRules {
	/** Separates title, part and status in file names: "<Titel> - <Stimme> - FEHLT.pdf". */
	separator: string;
	/** File-name prefix marking a score or a real solo part, sorted first. */
	featuredPrefix: string;
	/** Status words appended to a file name. */
	status: {
		missing: string;
		empty: string;
		incomplete: string;
	};
	/** Other words that mean the same as a status word, e.g. older English names. Lower-case keys. */
	statusAliases?: Record<string, 'missing' | 'empty' | 'incomplete'>;
	/** Catalogue numbers recognised in folder names, e.g. "BWV 147", "KV 492", "Op. 90". */
	cataloguePatterns: RegExp[];
	/**
	 * Folders inside the archive that group pieces instead of being a piece themselves,
	 * e.g. "00 | Weihnachtsstücke". The first capture group is the category's display name.
	 */
	categoryFolderPattern: RegExp;
	/**
	 * Folders in the current-programme folders that are a programme rather than a piece,
	 * e.g. "Programm A-Orchester". The first capture group is the programme's name, shown
	 * as a tag on its pieces.
	 */
	programFolderPattern: RegExp;
	/**
	 * Composer names recognised at the start (or end) of a folder name without a
	 * catalogue number, e.g. "Bizet - Carmen". Unknown names are left in the title.
	 */
	knownComposers: string[];
	/** Key names in part file names and how to show them: { bb: "B", eb: "Es" }. Lower-case keys. */
	transpositions: Record<string, string>;
	/**
	 * Extra words describing a part file, lower-case words → shown text:
	 * { vereinfacht: "vereinfacht", "mit notizen": "mit Notizen" }.
	 */
	partNotes: Record<string, string>;
	/** Word for a movement number glued to the front of a file name ("4_Viola" → "Satz 4"). */
	movementNote?: string;
	/** Words a part file name may carry that say nothing about the part, e.g. the source "IMSLP". Lower case. */
	ignoredWords?: string[];
	/**
	 * Longest short title before the part ("<Kurztitel> - <Stimme>"), so names stay readable on
	 * a phone. Longer ones are shortened in the suggestions. Default 18.
	 */
	maxShortTitle?: number;
}

export interface EventKeywords {
	/** Lower-case words in a calendar event title that mark its type. First match wins, in this order. */
	generalprobe: string[];
	probe: string[];
	konzert: string[];
}

/** Icons for the orchestra's links; anything else shows a globe. */
export type LinkIcon = 'globe' | 'instagram' | 'facebook' | 'youtube' | 'mail';

export interface OrchestraLink {
	/** Shown next to the icon, and read out by screen readers. */
	label: string;
	/** Only http(s) links are shown. */
	url: string;
	icon?: LinkIcon;
}

export interface OrchestraConfig {
	/** Default display name; the ORCHESTRA_NAME variable overrides it per deployment. */
	name: string;
	/** Short name for the header on small screens. */
	shortName: string;
	/** Accent colour as any CSS colour. */
	accent: string;
	/** IANA time zone for showing dates and times, e.g. "Europe/Berlin". */
	timeZone: string;
	/** Locale for dates and sorting, e.g. "de-DE". */
	locale: string;
	/** Instruments in display order; parts are sorted by this list. */
	instruments: Instrument[];
	/**
	 * The orchestra's own seating where it differs from the usual (#249): a section's zone, row
	 * or order by its id or instrument, e.g. German seating with the second violins on the right,
	 * `{ 'Geige:2': { order: 4 }, Kontrabass: { zone: 'left' } }`.
	 */
	seating?: { overrides?: SeatingOverrides };
	naming: NamingRules;
	events: EventKeywords;
	/**
	 * Short names of the orchestras or ensembles, offered as a dropdown in the sheet's
	 * "Orchester" column. The first one is used for concerts added from the calendar.
	 */
	orchestras: string[];
	/**
	 * Parts written for a group rather than one instrument, and who plays from them:
	 * { "B-Stimmen": ["Klarinette", "Trompete"] }. Used for "Meine Noten" and the
	 * instrumentation check, so a clarinettist also gets the B part. Instrument names as above.
	 */
	sharedParts?: Record<string, string[]>;
	/**
	 * Groups a player of a generic part (Schlagwerk, Percussion) ticks in their profile instead of
	 * every instrument: { Trommeln: ["Snare Drum", "Bass Drum"], Stabspiele: [...] }. Kept as
	 * "Schlagwerk (Trommeln, Stabspiele ohne Marimba)"; then only those instruments' parts reach them.
	 */
	instrumentSets?: Record<string, string[]>;
	/**
	 * Instruments whose parts count apart under "Wer kommt?" ("Geige I", "Geige II"); every other
	 * instrument is one line however many parts it has ("Cello"), unless the viewer splits them.
	 */
	splitSections?: string[];
	/**
	 * The orchestras of grown-ups ("EO"). On trips (#334), members of none of them count as young,
	 * like members with a parent account: they come along as Musiker·in only, for the whole trip.
	 * Without it, only members with a parent account count as young.
	 */
	adultOrchestras?: string[];
	/**
	 * Genres offered when editing a piece, together with the ones already in the sheet.
	 * Suggestions from Wikidata or the year are only made in these words.
	 */
	genres?: string[];
	/**
	 * Roles offered in /admin ("Standardrollen anlegen"): groups with a set of rights.
	 * Once added they're ordinary rows in "Gruppen" and "Rechte" and can be changed freely.
	 */
	roles?: RolePreset[];
	/**
	 * Accent for the light scheme as any CSS colour, when the one derived from `accent` isn't
	 * the look wanted. Only used while ORCHESTRA_ACCENT doesn't set another colour.
	 */
	accentLight?: string;
	/** "bold" (default): condensed headings and the logo behind the greeting; "plain": a classic serif (#163). */
	look?: Look;
	/**
	 * Parts of the app this orchestra doesn't use, e.g. { loans: false, musicReport: false }.
	 * Everything is on by default; FEATURES_OFF turns more off per deployment (#134).
	 * `musicReport` is the music list for the collecting society ("Musikfolge (GEMA)"); its words
	 * are in the texts, so another country's society only needs a translation.
	 */
	features?: Partial<Features>;
	/**
	 * Link to the app's source code, shown as a quiet line in the footer. Off when unset:
	 * a deployment for children and teens may not want to point to a personal profile.
	 */
	sourceUrl?: string;
}
