import { env } from 'cloudflare:workers';
import { normalizeEmail } from '#lib/access/access.ts';
import { albumKey, albumWhen, kindOfEvent, parseAlbumKey, storageBudget, uploadRefusal, type AlbumKind, type AlbumSnapshot, type AlbumType, type VideoPiece } from '#lib/album/album.ts';
import { config } from '#lib/config/index.ts';
import { eventDay } from '#lib/repertoire/dates.ts';
import type { ShownEvent } from '#lib/events/schedule.ts';
import { MemoryAlbumStore, MemoryPhotoFiles, R2PhotoFiles, SqlAlbumStore, type AlbumStore, type PhotoFiles, type R2Like } from './album-store.ts';
import { DEMO_ADMIN, DEMO_DESK_PARTNER, DEMO_MEMBER } from './demo/data.ts';
import type { D1 } from './db/sql.ts';
import { appEnv, features, isDemo } from './env.ts';
import { getLibrary, isPastConcert, orchestraOf } from './library.ts';
import { today } from './members.ts';
import { notShownAt } from './photos.ts';
import { perDatabase } from './polls-store.ts';
import { getAccessList } from './repertoire.ts';
import { tripStore } from './trips.ts';

/**
 * The photo album (#66), see #lib/album/album.ts. The records live in D1 (the binding "DB"),
 * the images in R2 (the binding "PHOTOS"); without either the pages say it isn't set up. The
 * demo keeps both in memory, with a few sample pictures.
 */

export const ALBUM_RIGHT = 'fotos.freigeben';

let demo: Promise<{ store: MemoryAlbumStore; files: MemoryPhotoFiles }> | null = null;
const sql = perDatabase((db) => new SqlAlbumStore(db));
const r2 = new WeakMap<R2Like, R2PhotoFiles>();

/** The records and the images, or null while the feature is off or a binding is missing. */
export async function albumStorage(): Promise<{ store: AlbumStore; files: PhotoFiles } | null> {
	if (!features().album) return null;
	if (isDemo()) return (demo ??= demoAlbum());
	const { DB: db, PHOTOS: bucket } = env as { DB?: D1; PHOTOS?: R2Like };
	if (!db || !bucket) return null;
	let files = r2.get(bucket);
	if (!files) r2.set(bucket, (files = new R2PhotoFiles(bucket)));
	return { store: sql(db), files };
}

/** Just the records, for counts and the data export; works without R2. */
export async function albumStore(): Promise<AlbumStore | null> {
	if (!features().album) return null;
	if (isDemo()) return (await (demo ??= demoAlbum())).store;
	const db = (env as { DB?: D1 }).DB;
	return db ? sql(db) : null;
}

/** Back to the sample pictures, with the rest of the demo. */
export function resetDemoAlbum() {
	demo = null;
}

export interface AlbumViewer {
	email: string;
	name: string;
	/** Has "fotos.freigeben": sees and approves what waits, takes anything away. */
	approves: boolean;
}

/**
 * Who looks at the album: signed-in members, not parent-only accounts. Photos show people, so
 * nobody sees them without signing in (the website gets only what was made public).
 */
export async function albumViewer(locals: App.Locals): Promise<AlbumViewer | null> {
	const user = locals.access.user;
	if (locals.auth !== 'on' || !user || !locals.access.member || locals.access.parent?.only) return null;
	const email = normalizeEmail(user.email);
	const member = (await getAccessList().catch(() => null))?.membersByEmail.get(email);
	return { email, name: member?.name || user.name || email, approves: locals.access.rights.has(ALBUM_RIGHT) };
}

export interface ResolvedAlbum extends AlbumSnapshot {
	type: AlbumType;
	id: string;
	/** "Samstag, 14. November 2026", "Juni 1972". */
	when: string;
	/** Photos may be added: the date or trip has begun. */
	open: boolean;
	/** The date's or trip's own page. */
	back?: string;
	/** The calendar date, for the consent check on approval. */
	event?: ShownEvent;
}

const dayOfEvent = (event: ShownEvent) => eventDay(event, config.timeZone);

/**
 * What an album is about, from its key: a date in the calendar or the archive (concerts back to
 * the founding, with the calendar's id when there is one), a trip, or an album of its own. A
 * date that has left the calendar keeps its album through what its photos remember.
 */
export async function resolveAlbum(type: AlbumType, id: string, store: AlbumStore): Promise<ResolvedAlbum | null> {
	const key = albumKey(type, id);
	const day = today();
	const resolved = (snapshot: Omit<AlbumSnapshot, 'album'>, rest: Pick<ResolvedAlbum, 'open' | 'back' | 'event'>): ResolvedAlbum => ({
		...snapshot,
		album: key,
		type,
		id,
		when: albumWhen(snapshot.day, config.locale),
		...rest
	});
	if (type === 'termin') {
		const library = await getLibrary().catch(() => null);
		const concert = library?.concertsById.get(id);
		const event = library?.schedule.ok ? library.schedule.byId.get(id) : undefined;
		if (concert) {
			return resolved(
				{ kind: 'konzert', title: concert.title, day: concert.event ? dayOfEvent(concert.event) : concert.dateKey },
				{ open: isPastConcert(concert, library!.today) || (concert.event?.daysUntil ?? 1) <= 0, back: `/kalender/${encodeURIComponent(id)}`, event: concert.event }
			);
		}
		if (event) {
			return resolved({ kind: kindOfEvent(event.type), title: event.displayTitle, day: dayOfEvent(event) }, { open: event.daysUntil <= 0, back: `/kalender/${encodeURIComponent(id)}`, event });
		}
	} else if (type === 'fahrt') {
		const trip = features().trips ? await tripStore()?.get(id).catch(() => null) : null;
		if (trip) return resolved({ kind: 'fahrt', title: trip.title, day: trip.firstDay }, { open: trip.firstDay <= day, back: `/fahrten/${encodeURIComponent(id)}` });
	} else {
		const own = await store.ownAlbum(id);
		if (own) return resolved({ kind: 'sonstiges', title: own.title, day: own.day }, { open: true });
	}
	// Gone from the calendar or the trips, but its photos remember it.
	const [kept] = await store.photos({ album: key });
	return kept ? resolved({ kind: kept.kind, title: kept.title, day: kept.day }, { open: true }) : null;
}

/** The album's page from a key, or null for a key that names nothing. */
export async function resolveAlbumKey(key: string, store: AlbumStore) {
	const parsed = parseAlbumKey(key);
	return parsed ? resolveAlbum(parsed.type, parsed.id, store) : null;
}

export interface AlbumChoice {
	key: string;
	kind: AlbumKind;
	title: string;
	day: string;
	when: string;
}

/**
 * Everything photos can be added to, newest first: every past concert of the archive (back to
 * the founding), past rehearsals and other dates in the calendar, trips that have begun, and
 * the albums of their own.
 */
export async function albumChoices(store: AlbumStore): Promise<AlbumChoice[]> {
	const day = today();
	const [library, trips, own] = await Promise.all([
		getLibrary().catch(() => null),
		features().trips ? (tripStore()?.list().catch(() => []) ?? []) : [],
		store.ownAlbums()
	]);
	const choices: Omit<AlbumChoice, 'when'>[] = [];
	const concerts = new Set<string>();
	for (const concert of library?.concerts ?? []) {
		if (!isPastConcert(concert, library!.today)) continue;
		concerts.add(concert.id);
		choices.push({ key: albumKey('termin', concert.id), kind: 'konzert', title: concert.title, day: concert.event ? dayOfEvent(concert.event) : concert.dateKey });
	}
	for (const event of library?.schedule.ok ? library.schedule.events : []) {
		if (event.daysUntil > 0 || concerts.has(event.id)) continue;
		choices.push({ key: albumKey('termin', event.id), kind: kindOfEvent(event.type), title: event.displayTitle, day: dayOfEvent(event) });
	}
	for (const trip of trips) if (trip.firstDay <= day) choices.push({ key: albumKey('fahrt', trip.id), kind: 'fahrt', title: trip.title, day: trip.firstDay });
	for (const album of own) choices.push({ key: albumKey('album', album.id), kind: 'sonstiges', title: album.title, day: album.day });
	return choices
		.sort((a, b) => b.day.localeCompare(a.day) || a.title.localeCompare(b.title))
		.map((choice) => ({ ...choice, when: albumWhen(choice.day, config.locale) }));
}

/** For a date's or trip's page: how many photos and comments its album has, and where it is. */
export async function albumLink(locals: App.Locals, type: AlbumType, id: string, begun: boolean): Promise<{ href: string; photos: number; videos: number; comments: number } | null> {
	if (!begun || !(await albumViewer(locals))) return null;
	const store = await albumStore();
	if (!store) return null;
	try {
		const key = albumKey(type, id);
		const [photos, videos, comments] = await Promise.all([store.photos({ album: key, status: 'approved' }), store.videos({ album: key, status: 'approved' }), store.comments(key)]);
		return { href: `/fotos/${type}/${encodeURIComponent(id)}`, photos: photos.length, videos: videos.length, comments: comments.length };
	} catch (cause) {
		console.error('Reading the album of a date failed:', cause);
		return null;
	}
}

/** For "Meine Daten herunterladen": the member's photos and comments, with the albums' titles; null without the store. */
export async function myAlbum(email: string) {
	try {
		const store = await albumStore();
		if (!store) return null;
		const [photos, videos, comments, all] = await Promise.all([store.photos({ email }), store.videos({ email }), store.commentsBy(email), store.photos()]);
		const titles = new Map(all.map((photo) => [photo.album, photo.title]));
		return { photos, videos, comments, titles };
	} catch (cause) {
		console.error('Reading the album for the data export failed:', cause);
		return null;
	}
}

/** The storage budget and what's used of it (#408). */
export async function storageUse(store: AlbumStore): Promise<{ stored: number; budget: number }> {
	return { stored: await store.storedBytes(), budget: storageBudget(isDemo() ? undefined : appEnv().PHOTOS_MAX_GB) };
}

/**
 * Whether an upload fits: R2 stays in its free tier (#408), so uploads stop at the storage budget,
 * and one member can add at most so many photos a day and have so many waiting. Those who approve
 * aren't limited per day, only by the budget.
 */
export async function checkUpload(store: AlbumStore, viewer: AlbumViewer, upload: { count: number; bytes: number }) {
	const since = new Date(Date.now() - 86_400_000).toISOString();
	const [use, mine] = await Promise.all([storageUse(store), store.uploadsOf(viewer.email, since)]);
	return uploadRefusal(upload, { ...use, today: mine.since, waiting: mine.waiting, approves: viewer.approves });
}

/** The pieces a recording of this album can contain: its concert's programme, for a rehearsal the concert it prepares. */
export async function albumPieces(album: ResolvedAlbum): Promise<Omit<VideoPiece, 'start'>[]> {
	if (album.type !== 'termin') return [];
	const library = await getLibrary().catch(() => null);
	if (!library) return [];
	const concert = library.concertsById.get(album.id) ?? (album.event?.concertId ? library.concertsById.get(album.event.concertId) : undefined);
	const seen = new Set<string>();
	return (concert?.program ?? []).flatMap((item) => {
		if (!item.pieceId || seen.has(item.pieceId)) return [];
		seen.add(item.pieceId);
		return [{ pieceId: item.pieceId, title: item.title }];
	});
}

/** For a piece's page: the approved recordings that contain it, newest first, starting where it starts. */
export async function recordingsOfPiece(locals: App.Locals, pieceId: string) {
	if (!(await albumViewer(locals))) return [];
	const store = await albumStore();
	if (!store) return [];
	try {
		const videos = await store.videos({ status: 'approved' });
		return videos.flatMap((video) => {
			const piece = video.pieces.find((one) => one.pieceId === pieceId);
			if (!piece) return [];
			return [{ id: video.id, youtube: video.youtube, start: piece.start ?? video.start, title: video.title, album: video.albumTitle, when: albumWhen(video.day, config.locale), href: `${albumHrefOf(video.album)}#aufnahme-${video.id}` }];
		});
	} catch (cause) {
		console.error('Reading the recordings of a piece failed:', cause);
		return [];
	}
}

const albumHrefOf = (key: string) => {
	const parsed = parseAlbumKey(key);
	return parsed ? `/fotos/${parsed.type}/${encodeURIComponent(parsed.id)}` : '/fotos';
};

/** Before approving photos of a calendar date: who may not be shown; null when it can't tell (archive, trips). */
export async function consentGaps(album: ResolvedAlbum): Promise<string[] | null> {
	if (!album.event) return null;
	const library = await getLibrary().catch(() => null);
	return library ? notShownAt(album.event, orchestraOf(library, album.event), library.today) : null;
}

/** A picture for the demo: a soft gradient with a few notes on it, as SVG. */
function demoPicture(hue: number, label: string): Uint8Array {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},50%,32%)"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><g fill="rgba(255,255,255,.75)"><ellipse cx="420" cy="470" rx="46" ry="34" transform="rotate(-20 420 470)"/><rect x="458" y="250" width="12" height="225"/><ellipse cx="640" cy="420" rx="46" ry="34" transform="rotate(-20 640 420)"/><rect x="678" y="200" width="12" height="225"/><rect x="458" y="200" width="232" height="40" transform="skewY(-12)" transform-origin="458 250"/></g><text x="60" y="740" font-family="sans-serif" font-size="44" fill="white">${label}</text></svg>`;
	return new TextEncoder().encode(svg);
}

/** Two past concerts with photos and a comment, an old summer party, and one photo waiting for approval. */
async function demoAlbum(): Promise<{ store: MemoryAlbumStore; files: MemoryPhotoFiles }> {
	const store = new MemoryAlbumStore();
	const files = new MemoryPhotoFiles();
	const add = async (snapshot: AlbumSnapshot, hue: number, label: string, who: { email: string; name: string }, approved: boolean, caption?: string) => {
		const bytes = demoPicture(hue, label);
		const photo = await store.addPhoto({ ...snapshot, email: who.email, name: who.name, width: 1200, height: 800, type: 'image/svg+xml', bytes: bytes.length * 2, ...(caption ? { caption } : {}) });
		await files.put(photo.id, 'full', bytes, 'image/svg+xml');
		await files.put(photo.id, 'thumb', bytes, 'image/svg+xml');
		if (approved) await store.approve(photo.id, false, DEMO_ADMIN.email);
	};
	const library = await getLibrary().catch(() => null);
	const past = (library?.concerts ?? []).filter((concert) => isPastConcert(concert, library!.today)).slice(0, 2);
	for (const [i, concert] of past.entries()) {
		const snapshot: AlbumSnapshot = { album: albumKey('termin', concert.id), kind: 'konzert', title: concert.title, day: concert.event ? dayOfEvent(concert.event) : concert.dateKey };
		await add(snapshot, 200 + i * 60, concert.title, DEMO_DESK_PARTNER, true, i ? undefined : 'Nach dem Schlussakkord');
		await add(snapshot, 230 + i * 60, concert.title, DEMO_MEMBER, true);
		await add(snapshot, 260 + i * 60, concert.title, DEMO_DESK_PARTNER, i === 1);
		if (!i) {
			// A recording of the whole concert, with where its first pieces start (#408); a video everyone may embed.
			const pieces = concert.program.filter((item) => item.pieceId).slice(0, 3);
			const video = await store.addVideo({
				...snapshot,
				albumTitle: snapshot.title,
				title: 'Mitschnitt des ganzen Konzerts',
				youtube: 'aqz-KE-bpKQ',
				email: DEMO_ADMIN.email,
				name: DEMO_ADMIN.name,
				pieces: pieces.map((item, n) => ({ pieceId: item.pieceId!, title: item.title, ...(n ? { start: n * 240 } : {}) }))
			});
			await store.approveVideo(video.id, DEMO_ADMIN.email);
		}
		if (!i) await store.addComment({ album: snapshot.album, email: DEMO_MEMBER.email, name: DEMO_MEMBER.name, text: 'Was für ein Abend! Der Saal war voll, und die Zugabe kam richtig gut an.' });
	}
	const party = await store.addOwnAlbum({ title: 'Sommerfest im Pfarrgarten', day: '1975-06', email: DEMO_ADMIN.email });
	const snapshot: AlbumSnapshot = { album: albumKey('album', party.id), kind: 'sonstiges', title: party.title, day: party.day };
	await add(snapshot, 35, 'Sommerfest 1975', DEMO_ADMIN, true, 'Aus dem Fotokasten von damals, eingescannt');
	await add(snapshot, 55, 'Sommerfest 1975', DEMO_ADMIN, true);
	return { store, files };
}
