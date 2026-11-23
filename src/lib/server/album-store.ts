import type { AlbumComment, AlbumPhoto, AlbumVideo, NewAlbumComment, NewAlbumPhoto, NewAlbumVideo, OwnAlbum } from '#lib/album/album.ts';
import type { D1 } from './db/sql.ts';

/**
 * Where the photo album's records are kept (#66): in D1 with plain SQL on a deployment, in
 * memory for the demo and tests; both behave the same, and the tests run the SQL against
 * SQLite. The images themselves are in R2 (PhotoFiles below), under the photo's id.
 */
export interface AlbumStore {
	/** Photos newest album first, in the order they were added within an album. */
	photos(filter?: { album?: string; status?: AlbumPhoto['status']; public?: boolean; email?: string }): Promise<AlbumPhoto[]>;
	photo(id: string): Promise<AlbumPhoto | null>;
	addPhoto(photo: NewAlbumPhoto, now?: string): Promise<AlbumPhoto>;
	/** Approves a waiting photo, or changes whether an approved one is public; false when it's gone. */
	approve(id: string, isPublic: boolean, by: string): Promise<boolean>;
	removePhoto(id: string): Promise<boolean>;
	/** How many photos and recordings wait for approval: one query for the to-do counts on every page. */
	pendingCount(): Promise<number>;
	/** All images together, in bytes, against the storage budget (#408). */
	storedBytes(): Promise<number>;
	/** One person's uploads since a moment, and theirs still waiting: the limits per person. */
	uploadsOf(email: string, since: string): Promise<{ since: number; waiting: number }>;

	/** Recordings (#408), newest album first. */
	videos(filter?: { album?: string; status?: AlbumVideo['status']; email?: string }): Promise<AlbumVideo[]>;
	video(id: string): Promise<AlbumVideo | null>;
	addVideo(video: NewAlbumVideo, now?: string): Promise<AlbumVideo>;
	approveVideo(id: string, by: string): Promise<boolean>;
	removeVideo(id: string): Promise<boolean>;

	comments(album: string): Promise<AlbumComment[]>;
	commentsBy(email: string): Promise<AlbumComment[]>;
	comment(id: string): Promise<AlbumComment | null>;
	addComment(comment: NewAlbumComment, now?: string): Promise<AlbumComment>;
	removeComment(id: string): Promise<boolean>;
	/** Comments per album, for the album cards. */
	commentCounts(): Promise<Map<string, number>>;

	ownAlbums(): Promise<OwnAlbum[]>;
	ownAlbum(id: string): Promise<OwnAlbum | null>;
	addOwnAlbum(album: Omit<OwnAlbum, 'id' | 'createdAt'>, now?: string): Promise<OwnAlbum>;

	/** For "Mitglied löschen" (#158): their photos and comments. */
	countBy(email: string): Promise<number>;
	/** Their photos stay, under a pseudonym; their comments go. */
	forget(email: string, stand: { email: string; name: string }): Promise<void>;
}

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS album_photos (
		id TEXT PRIMARY KEY,
		album TEXT NOT NULL,
		kind TEXT NOT NULL,
		title TEXT NOT NULL,
		day TEXT NOT NULL,
		status TEXT NOT NULL,
		public INTEGER NOT NULL DEFAULT 0,
		email TEXT NOT NULL,
		name TEXT NOT NULL,
		bytes INTEGER NOT NULL DEFAULT 0,
		data TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS album_photos_album ON album_photos (album)`,
	`CREATE INDEX IF NOT EXISTS album_photos_status ON album_photos (status)`,
	`CREATE INDEX IF NOT EXISTS album_photos_email ON album_photos (email)`,
	`CREATE TABLE IF NOT EXISTS album_comments (
		id TEXT PRIMARY KEY,
		album TEXT NOT NULL,
		email TEXT NOT NULL,
		name TEXT NOT NULL,
		text TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS album_comments_album ON album_comments (album)`,
	`CREATE INDEX IF NOT EXISTS album_comments_email ON album_comments (email)`,
	`CREATE TABLE IF NOT EXISTS album_videos (
		id TEXT PRIMARY KEY,
		album TEXT NOT NULL,
		kind TEXT NOT NULL,
		title TEXT NOT NULL,
		day TEXT NOT NULL,
		status TEXT NOT NULL,
		youtube TEXT NOT NULL,
		email TEXT NOT NULL,
		name TEXT NOT NULL,
		data TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS album_videos_album ON album_videos (album)`,
	`CREATE INDEX IF NOT EXISTS album_videos_status ON album_videos (status)`,
	`CREATE TABLE IF NOT EXISTS album_own (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		day TEXT NOT NULL,
		email TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`
];

interface PhotoRow {
	id: string;
	album: string;
	kind: string;
	title: string;
	day: string;
	status: string;
	public: number;
	email: string;
	name: string;
	bytes: number;
	data: string;
	created_at: string;
}

interface VideoRow {
	id: string;
	album: string;
	kind: string;
	title: string;
	day: string;
	status: string;
	youtube: string;
	email: string;
	name: string;
	data: string;
	created_at: string;
}

/** The video's own title, its start, its pieces and who approved it. */
type VideoData = Pick<AlbumVideo, 'start' | 'pieces' | 'approvedBy'> & { videoTitle: string };

const toVideo = (row: VideoRow): AlbumVideo => {
	const data = JSON.parse(row.data) as VideoData;
	return {
		id: row.id,
		album: row.album,
		kind: row.kind as AlbumVideo['kind'],
		albumTitle: row.title,
		title: data.videoTitle,
		day: row.day,
		status: row.status as AlbumVideo['status'],
		youtube: row.youtube,
		...(data.start ? { start: data.start } : {}),
		email: row.email,
		name: row.name,
		pieces: data.pieces ?? [],
		...(data.approvedBy ? { approvedBy: data.approvedBy } : {}),
		createdAt: row.created_at
	};
};

interface CommentRow {
	id: string;
	album: string;
	email: string;
	name: string;
	text: string;
	created_at: string;
}

interface OwnRow {
	id: string;
	title: string;
	day: string;
	email: string;
	created_at: string;
}

/** What isn't a column of its own goes into `data`. */
type PhotoData = Pick<AlbumPhoto, 'caption' | 'width' | 'height' | 'type' | 'approvedBy'>;

const toPhoto = (row: PhotoRow): AlbumPhoto => {
	const data = JSON.parse(row.data) as PhotoData;
	return {
		id: row.id,
		album: row.album,
		kind: row.kind as AlbumPhoto['kind'],
		title: row.title,
		day: row.day,
		status: row.status as AlbumPhoto['status'],
		public: !!row.public,
		email: row.email,
		name: row.name,
		...(data.caption ? { caption: data.caption } : {}),
		width: data.width,
		height: data.height,
		type: data.type,
		...(data.approvedBy ? { approvedBy: data.approvedBy } : {}),
		bytes: row.bytes,
		createdAt: row.created_at
	};
};

const toComment = (row: CommentRow): AlbumComment => ({ id: row.id, album: row.album, email: row.email, name: row.name, text: row.text, createdAt: row.created_at });
const toOwn = (row: OwnRow): OwnAlbum => ({ id: row.id, title: row.title, day: row.day, email: row.email, createdAt: row.created_at });
const photoData = (photo: Pick<AlbumPhoto, 'caption' | 'width' | 'height' | 'type' | 'approvedBy'>): PhotoData => ({
	...(photo.caption ? { caption: photo.caption } : {}),
	width: photo.width,
	height: photo.height,
	type: photo.type,
	...(photo.approvedBy ? { approvedBy: photo.approvedBy } : {})
});
/** Long enough that a photo's address can't be guessed: it is the key of a public image. */
const newId = () => crypto.randomUUID().replace(/-/g, '');
const videoData = (video: Pick<AlbumVideo, 'title' | 'start' | 'pieces' | 'approvedBy'>): VideoData => ({
	videoTitle: video.title,
	...(video.start ? { start: video.start } : {}),
	pieces: video.pieces,
	...(video.approvedBy ? { approvedBy: video.approvedBy } : {})
});
const ORDER = 'ORDER BY day DESC, album, created_at, id';

export class SqlAlbumStore implements AlbumStore {
	#ready: Promise<void> | null = null;

	constructor(private readonly db: D1) {}

	/** The tables are made on first use, so a new D1 database needs no setup step. */
	private ready(): Promise<void> {
		this.#ready ??= (async () => {
			for (const statement of SCHEMA) await this.db.prepare(statement).run();
		})().catch((cause) => {
			this.#ready = null;
			throw cause;
		});
		return this.#ready;
	}

	async photos(filter: { album?: string; status?: AlbumPhoto['status']; public?: boolean; email?: string } = {}): Promise<AlbumPhoto[]> {
		await this.ready();
		const where: string[] = [];
		const values: unknown[] = [];
		if (filter.album !== undefined) (where.push('album = ?'), values.push(filter.album));
		if (filter.status) (where.push('status = ?'), values.push(filter.status));
		if (filter.public !== undefined) (where.push('public = ?'), values.push(filter.public ? 1 : 0));
		if (filter.email !== undefined) (where.push('email = ?'), values.push(filter.email));
		const sql = `SELECT * FROM album_photos ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ${ORDER}`;
		const { results } = await this.db.prepare(sql).bind(...values).all<PhotoRow>();
		return results.map(toPhoto);
	}

	async photo(id: string): Promise<AlbumPhoto | null> {
		await this.ready();
		const row = await this.db.prepare('SELECT * FROM album_photos WHERE id = ?').bind(id).first<PhotoRow>();
		return row ? toPhoto(row) : null;
	}

	async addPhoto(photo: NewAlbumPhoto, now = new Date().toISOString()): Promise<AlbumPhoto> {
		await this.ready();
		const id = newId();
		await this.db
			.prepare('INSERT INTO album_photos (id, album, kind, title, day, status, public, email, name, bytes, data, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)')
			.bind(id, photo.album, photo.kind, photo.title, photo.day, 'pending', photo.email, photo.name, photo.bytes, JSON.stringify(photoData(photo)), now)
			.run();
		return (await this.photo(id))!;
	}

	async approve(id: string, isPublic: boolean, by: string): Promise<boolean> {
		const photo = await this.photo(id);
		if (!photo) return false;
		await this.db
			.prepare("UPDATE album_photos SET status = 'approved', public = ?, data = ? WHERE id = ?")
			.bind(isPublic ? 1 : 0, JSON.stringify(photoData({ ...photo, approvedBy: photo.approvedBy ?? by })), id)
			.run();
		return true;
	}

	async removePhoto(id: string): Promise<boolean> {
		if (!(await this.photo(id))) return false;
		await this.db.prepare('DELETE FROM album_photos WHERE id = ?').bind(id).run();
		return true;
	}

	async pendingCount(): Promise<number> {
		await this.ready();
		const row = await this.db
			.prepare("SELECT (SELECT COUNT(*) FROM album_photos WHERE status = 'pending') + (SELECT COUNT(*) FROM album_videos WHERE status = 'pending') AS n")
			.first<{ n: number }>();
		return row?.n ?? 0;
	}

	async storedBytes(): Promise<number> {
		await this.ready();
		const row = await this.db.prepare('SELECT COALESCE(SUM(bytes), 0) AS n FROM album_photos').first<{ n: number }>();
		return row?.n ?? 0;
	}

	async uploadsOf(email: string, since: string): Promise<{ since: number; waiting: number }> {
		await this.ready();
		const row = await this.db
			.prepare("SELECT COALESCE(SUM(created_at >= ?), 0) AS since, COALESCE(SUM(status = 'pending'), 0) AS waiting FROM album_photos WHERE email = ?")
			.bind(since, email)
			.first<{ since: number; waiting: number }>();
		return { since: row?.since ?? 0, waiting: row?.waiting ?? 0 };
	}

	async videos(filter: { album?: string; status?: AlbumVideo['status']; email?: string } = {}): Promise<AlbumVideo[]> {
		await this.ready();
		const where: string[] = [];
		const values: unknown[] = [];
		if (filter.album !== undefined) (where.push('album = ?'), values.push(filter.album));
		if (filter.status) (where.push('status = ?'), values.push(filter.status));
		if (filter.email !== undefined) (where.push('email = ?'), values.push(filter.email));
		const sql = `SELECT * FROM album_videos ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ${ORDER}`;
		const { results } = await this.db.prepare(sql).bind(...values).all<VideoRow>();
		return results.map(toVideo);
	}

	async video(id: string): Promise<AlbumVideo | null> {
		await this.ready();
		const row = await this.db.prepare('SELECT * FROM album_videos WHERE id = ?').bind(id).first<VideoRow>();
		return row ? toVideo(row) : null;
	}

	async addVideo(video: NewAlbumVideo, now = new Date().toISOString()): Promise<AlbumVideo> {
		await this.ready();
		const id = newId();
		await this.db
			.prepare('INSERT INTO album_videos (id, album, kind, title, day, status, youtube, email, name, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
			.bind(id, video.album, video.kind, video.albumTitle, video.day, 'pending', video.youtube, video.email, video.name, JSON.stringify(videoData(video)), now)
			.run();
		return (await this.video(id))!;
	}

	async approveVideo(id: string, by: string): Promise<boolean> {
		const video = await this.video(id);
		if (!video) return false;
		await this.db
			.prepare("UPDATE album_videos SET status = 'approved', data = ? WHERE id = ?")
			.bind(JSON.stringify(videoData({ ...video, approvedBy: video.approvedBy ?? by })), id)
			.run();
		return true;
	}

	async removeVideo(id: string): Promise<boolean> {
		if (!(await this.video(id))) return false;
		await this.db.prepare('DELETE FROM album_videos WHERE id = ?').bind(id).run();
		return true;
	}

	async comments(album: string): Promise<AlbumComment[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM album_comments WHERE album = ? ORDER BY created_at, id').bind(album).all<CommentRow>();
		return results.map(toComment);
	}

	async commentsBy(email: string): Promise<AlbumComment[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM album_comments WHERE email = ? ORDER BY created_at, id').bind(email).all<CommentRow>();
		return results.map(toComment);
	}

	async comment(id: string): Promise<AlbumComment | null> {
		await this.ready();
		const row = await this.db.prepare('SELECT * FROM album_comments WHERE id = ?').bind(id).first<CommentRow>();
		return row ? toComment(row) : null;
	}

	async addComment(comment: NewAlbumComment, now = new Date().toISOString()): Promise<AlbumComment> {
		await this.ready();
		const id = newId();
		await this.db
			.prepare('INSERT INTO album_comments (id, album, email, name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(id, comment.album, comment.email, comment.name, comment.text, now)
			.run();
		return { ...comment, id, createdAt: now };
	}

	async removeComment(id: string): Promise<boolean> {
		if (!(await this.comment(id))) return false;
		await this.db.prepare('DELETE FROM album_comments WHERE id = ?').bind(id).run();
		return true;
	}

	async commentCounts(): Promise<Map<string, number>> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT album, COUNT(*) AS n FROM album_comments GROUP BY album').all<{ album: string; n: number }>();
		return new Map(results.map((row) => [row.album, row.n]));
	}

	async ownAlbums(): Promise<OwnAlbum[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM album_own ORDER BY day DESC, title').all<OwnRow>();
		return results.map(toOwn);
	}

	async ownAlbum(id: string): Promise<OwnAlbum | null> {
		await this.ready();
		const row = await this.db.prepare('SELECT * FROM album_own WHERE id = ?').bind(id).first<OwnRow>();
		return row ? toOwn(row) : null;
	}

	async addOwnAlbum(album: Omit<OwnAlbum, 'id' | 'createdAt'>, now = new Date().toISOString()): Promise<OwnAlbum> {
		await this.ready();
		const id = newId().slice(0, 12);
		await this.db.prepare('INSERT INTO album_own (id, title, day, email, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, album.title, album.day, album.email, now).run();
		return { ...album, id, createdAt: now };
	}

	async countBy(email: string): Promise<number> {
		await this.ready();
		const row = await this.db
			.prepare('SELECT (SELECT COUNT(*) FROM album_photos WHERE email = ?) + (SELECT COUNT(*) FROM album_videos WHERE email = ?) + (SELECT COUNT(*) FROM album_comments WHERE email = ?) AS n')
			.bind(email, email, email)
			.first<{ n: number }>();
		return row?.n ?? 0;
	}

	async forget(email: string, stand: { email: string; name: string }): Promise<void> {
		await this.ready();
		await this.db.prepare('UPDATE album_photos SET email = ?, name = ? WHERE email = ?').bind(stand.email, stand.name, email).run();
		await this.db.prepare('UPDATE album_videos SET email = ?, name = ? WHERE email = ?').bind(stand.email, stand.name, email).run();
		await this.db.prepare('UPDATE album_own SET email = ? WHERE email = ?').bind(stand.email, email).run();
		await this.db.prepare('DELETE FROM album_comments WHERE email = ?').bind(email).run();
	}
}

export class MemoryAlbumStore implements AlbumStore {
	private kept: AlbumPhoto[] = [];
	private films: AlbumVideo[] = [];
	private said: AlbumComment[] = [];
	private own: OwnAlbum[] = [];

	async photos(filter: { album?: string; status?: AlbumPhoto['status']; public?: boolean; email?: string } = {}) {
		return this.kept
			.filter(
				(photo) =>
					(filter.album === undefined || photo.album === filter.album) &&
					(!filter.status || photo.status === filter.status) &&
					(filter.public === undefined || photo.public === filter.public) &&
					(filter.email === undefined || photo.email === filter.email)
			)
			.sort((a, b) => b.day.localeCompare(a.day) || a.album.localeCompare(b.album) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
			.map((photo) => structuredClone(photo));
	}

	async photo(id: string) {
		const photo = this.kept.find((one) => one.id === id);
		return photo ? structuredClone(photo) : null;
	}

	async addPhoto(photo: NewAlbumPhoto, now = new Date().toISOString()) {
		const { caption, ...rest } = structuredClone(photo);
		const added: AlbumPhoto = { ...rest, ...(caption ? { caption } : {}), id: newId(), status: 'pending', public: false, createdAt: now };
		this.kept.push(added);
		return structuredClone(added);
	}

	async approve(id: string, isPublic: boolean, by: string) {
		const photo = this.kept.find((one) => one.id === id);
		if (!photo) return false;
		Object.assign(photo, { status: 'approved', public: isPublic, approvedBy: photo.approvedBy ?? by });
		return true;
	}

	async removePhoto(id: string) {
		const before = this.kept.length;
		this.kept = this.kept.filter((photo) => photo.id !== id);
		return this.kept.length < before;
	}

	async pendingCount() {
		return [...this.kept, ...this.films].filter((entry) => entry.status === 'pending').length;
	}

	async storedBytes() {
		return this.kept.reduce((sum, photo) => sum + photo.bytes, 0);
	}

	async uploadsOf(email: string, since: string) {
		const mine = this.kept.filter((photo) => photo.email === email);
		return { since: mine.filter((photo) => photo.createdAt >= since).length, waiting: mine.filter((photo) => photo.status === 'pending').length };
	}

	async videos(filter: { album?: string; status?: AlbumVideo['status']; email?: string } = {}) {
		return this.films
			.filter((video) => (filter.album === undefined || video.album === filter.album) && (!filter.status || video.status === filter.status) && (filter.email === undefined || video.email === filter.email))
			.sort((a, b) => b.day.localeCompare(a.day) || a.album.localeCompare(b.album) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
			.map((video) => structuredClone(video));
	}

	async video(id: string) {
		const video = this.films.find((one) => one.id === id);
		return video ? structuredClone(video) : null;
	}

	async addVideo(video: NewAlbumVideo, now = new Date().toISOString()) {
		const { start, ...rest } = structuredClone(video);
		const added: AlbumVideo = { ...rest, ...(start ? { start } : {}), id: newId(), status: 'pending', createdAt: now };
		this.films.push(added);
		return structuredClone(added);
	}

	async approveVideo(id: string, by: string) {
		const video = this.films.find((one) => one.id === id);
		if (!video) return false;
		Object.assign(video, { status: 'approved', approvedBy: video.approvedBy ?? by });
		return true;
	}

	async removeVideo(id: string) {
		const before = this.films.length;
		this.films = this.films.filter((video) => video.id !== id);
		return this.films.length < before;
	}

	private ordered(comments: AlbumComment[]) {
		return comments.map((comment) => structuredClone(comment)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
	}

	async comments(album: string) {
		return this.ordered(this.said.filter((comment) => comment.album === album));
	}

	async commentsBy(email: string) {
		return this.ordered(this.said.filter((comment) => comment.email === email));
	}

	async comment(id: string) {
		const comment = this.said.find((one) => one.id === id);
		return comment ? structuredClone(comment) : null;
	}

	async addComment(comment: NewAlbumComment, now = new Date().toISOString()) {
		const added = { ...structuredClone(comment), id: newId(), createdAt: now };
		this.said.push(added);
		return structuredClone(added);
	}

	async removeComment(id: string) {
		const before = this.said.length;
		this.said = this.said.filter((comment) => comment.id !== id);
		return this.said.length < before;
	}

	async commentCounts() {
		const counts = new Map<string, number>();
		for (const comment of this.said) counts.set(comment.album, (counts.get(comment.album) ?? 0) + 1);
		return counts;
	}

	async ownAlbums() {
		return this.own.map((album) => structuredClone(album)).sort((a, b) => b.day.localeCompare(a.day) || a.title.localeCompare(b.title));
	}

	async ownAlbum(id: string) {
		const album = this.own.find((one) => one.id === id);
		return album ? structuredClone(album) : null;
	}

	async addOwnAlbum(album: Omit<OwnAlbum, 'id' | 'createdAt'>, now = new Date().toISOString()) {
		const added = { ...structuredClone(album), id: newId().slice(0, 12), createdAt: now };
		this.own.push(added);
		return structuredClone(added);
	}

	async countBy(email: string) {
		return [...this.kept, ...this.films, ...this.said].filter((entry) => entry.email === email).length;
	}

	async forget(email: string, stand: { email: string; name: string }) {
		for (const entry of [...this.kept, ...this.films]) if (entry.email === email) Object.assign(entry, stand);
		for (const album of this.own) if (album.email === email) album.email = stand.email;
		this.said = this.said.filter((comment) => comment.email !== email);
	}
}

/** The parts of an R2 bucket the album uses; typed by hand like cloudflare.d.ts. */
export interface R2Like {
	put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<unknown>;
	get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string }; httpEtag?: string; size?: number } | null>;
	delete(keys: string | string[]): Promise<void>;
}

export type PhotoSize = 'full' | 'thumb';

/** The images, by photo id and size: in R2 when deployed, in memory for the demo and tests. */
export interface PhotoFiles {
	put(id: string, size: PhotoSize, bytes: Uint8Array, type: string): Promise<void>;
	get(id: string, size: PhotoSize): Promise<{ body: ReadableStream | Uint8Array; type: string; etag?: string } | null>;
	remove(id: string): Promise<void>;
}

const fileKey = (id: string, size: PhotoSize) => `fotos/${id}/${size}`;

export class R2PhotoFiles implements PhotoFiles {
	constructor(private readonly bucket: R2Like) {}

	async put(id: string, size: PhotoSize, bytes: Uint8Array, type: string) {
		await this.bucket.put(fileKey(id, size), bytes, { httpMetadata: { contentType: type } });
	}

	async get(id: string, size: PhotoSize) {
		const object = await this.bucket.get(fileKey(id, size));
		return object ? { body: object.body, type: object.httpMetadata?.contentType ?? 'application/octet-stream', ...(object.httpEtag ? { etag: object.httpEtag } : {}) } : null;
	}

	async remove(id: string) {
		await this.bucket.delete([fileKey(id, 'full'), fileKey(id, 'thumb')]);
	}
}

export class MemoryPhotoFiles implements PhotoFiles {
	private files = new Map<string, { bytes: Uint8Array; type: string }>();

	async put(id: string, size: PhotoSize, bytes: Uint8Array, type: string) {
		this.files.set(fileKey(id, size), { bytes: bytes.slice(), type });
	}

	async get(id: string, size: PhotoSize) {
		const file = this.files.get(fileKey(id, size));
		return file ? { body: file.bytes.slice(), type: file.type } : null;
	}

	async remove(id: string) {
		this.files.delete(fileKey(id, 'full'));
		this.files.delete(fileKey(id, 'thumb'));
	}
}
