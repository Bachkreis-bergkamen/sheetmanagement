import { startSeconds, youtubeId } from '#lib/links.ts';
import { formatFuzzyDate, type FuzzyDate } from '#lib/repertoire/dates.ts';

/**
 * Photos and impressions (#66): members add photos and comments to a past concert, rehearsal
 * or trip, or to an album of its own for anything older than the calendar (back to 1969, the
 * archive's concerts included). A photo shows once someone with "fotos.freigeben" approved it;
 * only those they also marked public reach the orchestra's website (/api/fotos).
 */

/** What an album is about; "sonstiges" is an album of its own (a summer party in 1975). */
export const ALBUM_KINDS = ['konzert', 'probe', 'fahrt', 'sonstiges'] as const;
export type AlbumKind = (typeof ALBUM_KINDS)[number];

/** Where the album hangs: a date (calendar or archive), a trip, or an album of its own. */
export const ALBUM_TYPES = ['termin', 'fahrt', 'album'] as const;
export type AlbumType = (typeof ALBUM_TYPES)[number];

/** The album's key in the tables: "termin:<id>", "fahrt:<id>", "album:<id>". */
export const albumKey = (type: AlbumType, id: string) => `${type}:${id}`;

export function parseAlbumKey(key: string): { type: AlbumType; id: string } | null {
	const at = key.indexOf(':');
	const type = key.slice(0, at) as AlbumType;
	const id = key.slice(at + 1);
	return at > 0 && id && ALBUM_TYPES.includes(type) ? { type, id } : null;
}

/** The album's page. */
export const albumHref = (key: string) => {
	const parsed = parseAlbumKey(key);
	return parsed ? `/fotos/${parsed.type}/${encodeURIComponent(parsed.id)}` : '/fotos';
};

/** What each photo remembers of its album, so the album still shows once the date left the calendar. */
export interface AlbumSnapshot {
	album: string;
	kind: AlbumKind;
	title: string;
	/** Sortable and as exact as known: "1969", "1972-06", "2026-11-14". */
	day: string;
}

export type PhotoStatus = 'pending' | 'approved';

export interface AlbumPhoto extends AlbumSnapshot {
	id: string;
	status: PhotoStatus;
	/** Approved for the orchestra's website as well. */
	public: boolean;
	/** Who uploaded it. */
	email: string;
	name: string;
	caption?: string;
	width: number;
	height: number;
	/** The image's media type, as checked on upload. */
	type: string;
	approvedBy?: string;
	/** The image and its thumbnail together, for the storage budget. */
	bytes: number;
	createdAt: string;
}

export type NewAlbumPhoto = Omit<AlbumPhoto, 'id' | 'status' | 'public' | 'approvedBy' | 'createdAt'>;

/** A piece in a recording, from the concert's programme, and where it starts in the video. */
export interface VideoPiece {
	pieceId: string;
	title: string;
	/** Seconds from the video's start. */
	start?: number;
}

/**
 * A recording (#408): an unlisted YouTube video, which only those with the link can play. The app
 * shows it to signed-in members only, never on the website (GEMA, data protection), and plays it
 * with youtube-nocookie only after a tap.
 */
export interface AlbumVideo extends Omit<AlbumSnapshot, 'title'> {
	/** The album's title, kept like a photo's. */
	albumTitle: string;
	id: string;
	/** The 11-character YouTube id. */
	youtube: string;
	/** Where the link pointed into the video. */
	start?: number;
	/** The recording's own title: "Mitschnitt", "Film von der Fahrt". */
	title: string;
	status: PhotoStatus;
	email: string;
	name: string;
	pieces: VideoPiece[];
	approvedBy?: string;
	createdAt: string;
}

export type NewAlbumVideo = Omit<AlbumVideo, 'id' | 'status' | 'approvedBy' | 'createdAt'>;

export interface AlbumComment {
	id: string;
	album: string;
	email: string;
	name: string;
	text: string;
	createdAt: string;
}

export type NewAlbumComment = Omit<AlbumComment, 'id' | 'createdAt'>;

/** An album of its own, for what's in neither the calendar nor the archive. */
export interface OwnAlbum {
	id: string;
	title: string;
	day: string;
	email: string;
	createdAt: string;
}

export const CAPTION_MAX = 300;
export const COMMENT_MAX = 1000;
export const TITLE_MAX = 120;
/** Per upload; the browser makes each photo smaller first (resize.ts), so these are generous. */
export const PHOTOS_PER_UPLOAD = 20;
export const PHOTO_MAX_BYTES = 6_000_000;
export const THUMB_MAX_BYTES = 600_000;
/** The longest edge the browser shrinks a photo and its thumbnail to. */
export const FULL_EDGE = 2048;
export const THUMB_EDGE = 480;
/**
 * R2 is free up to 10 GB, a million writes and ten million reads a month (#408); Cloudflare has no
 * spending cap, so the app keeps itself below that: uploads stop at the storage budget (9 GB unless
 * a deployment sets less with PHOTOS_MAX_GB), and one person can't flood it in a day.
 */
export const DEFAULT_BUDGET_GB = 9;
/** Never closer than this to the free 10 GB, whatever a deployment sets. */
export const MAX_BUDGET_GB = 9.5;
export const PHOTOS_PER_DAY = 100;
export const PENDING_PER_MEMBER = 200;

/** The storage budget in bytes from PHOTOS_MAX_GB ("5", "2,5"); the default for anything unreadable, never above MAX_BUDGET_GB. */
export function storageBudget(setting: string | undefined): number {
	const text = setting?.trim().replace(',', '.') ?? '';
	const gb = Number(text);
	const chosen = text && Number.isFinite(gb) && gb > 0 ? gb : DEFAULT_BUDGET_GB;
	return Math.floor(Math.min(chosen, MAX_BUDGET_GB) * 1024 ** 3);
}

/** Why an upload of `count` photos and `bytes` may not happen now; null when it may. */
export function uploadRefusal(
	upload: { count: number; bytes: number },
	usage: { stored: number; budget: number; today: number; waiting: number; approves: boolean }
): 'full' | 'daily' | 'waiting' | null {
	if (usage.stored + upload.bytes > usage.budget) return 'full';
	if (!usage.approves && usage.today + upload.count > PHOTOS_PER_DAY) return 'daily';
	if (!usage.approves && usage.waiting + upload.count > PENDING_PER_MEMBER) return 'waiting';
	return null;
}

/** "1,2 GB", "340 MB" for the budget line. */
export function formatBytes(bytes: number, locale: string): string {
	const [value, unit] = bytes >= 1024 ** 3 ? [bytes / 1024 ** 3, 'GB'] : [bytes / 1024 ** 2, 'MB'];
	return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${unit}`;
}

/** The video and start time of a YouTube link in any of its forms; null for anything else. */
export function videoLink(text: string): { youtube: string; start?: number } | null {
	const youtube = youtubeId(text);
	if (!youtube) return null;
	const url = new URL(text.trim());
	const start = startSeconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
	return { youtube, ...(start ? { start } : {}) };
}

/** "12:30" or "1:02:03" (or plain seconds) → seconds; undefined when empty, null when it can't be read. */
export function clockSeconds(text: string): number | undefined | null {
	const value = text.trim();
	if (!value) return undefined;
	if (/^\d{1,5}$/.test(value)) return Number(value);
	const match = /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/.exec(value);
	if (!match) return null;
	return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** 750 → "12:30", 3723 → "1:02:03". */
export function clockText(seconds: number): string {
	const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
	const pad = (n: number) => String(n).padStart(2, '0');
	return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The player's address: youtube-nocookie sets no cookies until the video plays. */
export const embedUrl = (youtube: string, start?: number) => `https://www.youtube-nocookie.com/embed/${youtube}?autoplay=1&rel=0${start ? `&start=${start}` : ''}`;

/** The video on YouTube itself, at the start time. */
export const watchUrl = (youtube: string, start?: number) => `https://www.youtube.com/watch?v=${youtube}${start ? `&t=${start}s` : ''}`;

/** The orchestra's first year: albums of their own go back that far. */
export const FIRST_YEAR = 1969;

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/** The image's real type from its first bytes; whatever the browser called it doesn't count. */
export function imageType(bytes: Uint8Array): ImageType | null {
	const starts = (...values: number[]) => values.every((value, i) => bytes[i] === value);
	if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
	if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
	const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
	if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
	return null;
}

/** Trimmed text within its limit, line breaks kept; null when empty or too long. */
export function cleanText(value: unknown, max: number): string | null {
	if (typeof value !== 'string') return null;
	const text = value.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
	return text && text.length <= max ? text : null;
}

/** "1972", "1972-06" or "1972-06-17" from an album's form, within FIRST_YEAR and today; null otherwise. */
export function albumDay(year: unknown, month: unknown, day: unknown, today: string): string | null {
	const y = Number(year);
	const m = month === '' || month === undefined || month === null ? 0 : Number(month);
	const d = day === '' || day === undefined || day === null ? 0 : Number(day);
	if (!Number.isInteger(y) || y < FIRST_YEAR || y > Number(today.slice(0, 4))) return null;
	if (!Number.isInteger(m) || m < 0 || m > 12 || !Number.isInteger(d) || d < 0 || d > 31 || (d && !m)) return null;
	const pad = (n: number) => String(n).padStart(2, '0');
	const key = [String(y), m ? pad(m) : '', d ? pad(d) : ''].filter(Boolean).join('-');
	if (d && new Date(`${key}T00:00:00Z`).getUTCDate() !== d) return null;
	return key <= today.slice(0, key.length) ? key : null;
}

/** "Juni 1972" for "1972-06"; the full date with its weekday for a day. */
export function albumWhen(day: string, locale: string): string {
	const [year, month, date] = day.split('-').map(Number);
	if (!year) return '';
	const fuzzy: FuzzyDate = { year, ...(month ? { month } : {}), ...(date ? { day: date } : {}) };
	return formatFuzzyDate(fuzzy, locale).long;
}

/** Who may take a photo away: who uploaded it, and those who approve. */
export const mayRemovePhoto = (photo: Pick<AlbumPhoto, 'email'>, viewer: { email: string; approves: boolean }) => viewer.approves || photo.email === viewer.email;

/** Who may take a comment away: who wrote it, and those who approve. */
export const mayRemoveComment = (comment: Pick<AlbumComment, 'email'>, viewer: { email: string; approves: boolean }) => viewer.approves || comment.email === viewer.email;

/** Which photos a viewer sees in an album: the approved ones, their own still waiting, and all of them for those who approve. */
export const visiblePhotos = <T extends Pick<AlbumPhoto, 'status' | 'email'>>(photos: T[], viewer: { email: string; approves: boolean }) =>
	photos.filter((photo) => photo.status === 'approved' || viewer.approves || photo.email === viewer.email);

export interface AlbumFilter {
	kind?: AlbumKind;
	/** "1972", or a decade: "1970er". */
	year?: string;
}

/** The filter from the album page's address: ?art=konzert&jahr=1970er. */
export function parseFilter(params: URLSearchParams): AlbumFilter {
	const kind = params.get('art') as AlbumKind | null;
	const year = params.get('jahr') ?? '';
	return {
		...(kind && ALBUM_KINDS.includes(kind) ? { kind } : {}),
		...(/^\d{4}$/.test(year) || /^\d{3}0er$/.test(year) ? { year } : {})
	};
}

const matchesYear = (day: string, year: string) => (year.endsWith('er') ? day.slice(0, 3) === year.slice(0, 3) : day.slice(0, 4) === year);

export interface AlbumGroup extends AlbumSnapshot {
	count: number;
	/** Approved recordings (#408). */
	videos: number;
	/** The photo shown on the album's card: its first one; null for an album of recordings only. */
	cover: string | null;
	/** Up to four, for the card's strip. */
	preview: string[];
}

type Entry = Pick<AlbumPhoto, keyof AlbumSnapshot | 'status' | 'id'>;

/** The approved photos and recordings as albums, newest first, filtered; each album with its first photo as the cover. */
export function albumGroups(photos: Entry[], filter: AlbumFilter = {}, videos: Entry[] = []): AlbumGroup[] {
	const groups = new Map<string, AlbumGroup>();
	const entries = [...photos.map((entry) => ({ entry, video: false })), ...videos.map((entry) => ({ entry, video: true }))];
	for (const { entry, video } of entries) {
		if (entry.status !== 'approved') continue;
		if (filter.kind && entry.kind !== filter.kind) continue;
		if (filter.year && !matchesYear(entry.day, filter.year)) continue;
		let group = groups.get(entry.album);
		if (!group) {
			group = { album: entry.album, kind: entry.kind, title: entry.title, day: entry.day, count: 0, videos: 0, cover: null, preview: [] };
			groups.set(entry.album, group);
		}
		if (video) {
			group.videos++;
			continue;
		}
		group.count++;
		group.cover ??= entry.id;
		if (group.preview.length < 4) group.preview.push(entry.id);
	}
	return [...groups.values()].sort((a, b) => b.day.localeCompare(a.day) || a.title.localeCompare(b.title));
}

/** The years and decades with approved photos or recordings, for the filter: newest first, decades only with more than one year. */
export function albumYears(photos: Entry[], videos: Entry[] = []): { years: string[]; decades: string[] } {
	const years = [...new Set([...photos, ...videos].filter((entry) => entry.status === 'approved').map((entry) => entry.day.slice(0, 4)))].sort().reverse();
	const perDecade = new Map<string, number>();
	for (const year of years) perDecade.set(`${year.slice(0, 3)}0er`, (perDecade.get(`${year.slice(0, 3)}0er`) ?? 0) + 1);
	return { years, decades: [...perDecade].filter(([, n]) => n > 1).map(([decade]) => decade) };
}

/** The album kind of a calendar date. */
export const kindOfEvent = (type: string): AlbumKind => (type === 'konzert' ? 'konzert' : type === 'probe' || type === 'generalprobe' ? 'probe' : 'sonstiges');
