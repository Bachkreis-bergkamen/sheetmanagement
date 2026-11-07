import type { KummerMessage, KummerThread, NewKummer } from '#lib/kummer/kummer.ts';
import type { SqlDatabase } from './polls-store.ts';

/**
 * Where the Kummerkasten is kept: in D1 with plain SQL on a deployment, in memory for the demo,
 * like the date polls. The writer is stored only as `authorKey`, a keyed hash of their address
 * (see kummer.ts on the server); it never leaves the server.
 */
export interface KummerStore {
	create(kummer: NewKummer, authorKey: string, now?: string): Promise<KummerThread>;
	/** All threads, newest activity first; the caller keeps those the viewer may see. */
	list(): Promise<KummerThread[]>;
	/** The writer's own threads, newest activity first. */
	listByAuthor(authorKey: string): Promise<KummerThread[]>;
	get(id: string): Promise<{ thread: KummerThread; authorKey: string; messages: KummerMessage[] } | null>;
	reply(id: string, message: Omit<KummerMessage, 'id' | 'createdAt'>, now?: string): Promise<void>;
	setClosed(id: string, closed: boolean): Promise<void>;
	/** When someone last looked at threads: an address for the Leitung, "author:<key>" for the writer. */
	markRead(id: string, reader: string, now?: string): Promise<void>;
	readsOf(reader: string): Promise<Map<string, string>>;
	/** For "Mitglied löschen" (#158): the writer's threads go, their answers lose the name. */
	countBy(email: string, authorKey: string): Promise<number>;
	forget(email: string, authorKey: string, stand: { email: string; name: string }): Promise<void>;
}

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS kummer_threads (
		id TEXT PRIMARY KEY,
		subject TEXT NOT NULL,
		recipients TEXT NOT NULL,
		author_key TEXT NOT NULL,
		author_name TEXT,
		created_at TEXT NOT NULL,
		last_author_at TEXT NOT NULL,
		last_leitung_at TEXT,
		closed_at TEXT
	)`,
	`CREATE INDEX IF NOT EXISTS kummer_threads_author ON kummer_threads (author_key)`,
	`CREATE TABLE IF NOT EXISTS kummer_messages (
		id TEXT PRIMARY KEY,
		thread_id TEXT NOT NULL,
		from_author INTEGER NOT NULL,
		sender_email TEXT,
		sender_name TEXT,
		body TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS kummer_messages_thread ON kummer_messages (thread_id, created_at)`,
	`CREATE TABLE IF NOT EXISTS kummer_reads (
		thread_id TEXT NOT NULL,
		reader TEXT NOT NULL,
		read_at TEXT NOT NULL,
		PRIMARY KEY (thread_id, reader)
	)`
];

interface ThreadRow {
	id: string;
	subject: string;
	recipients: string;
	author_key: string;
	author_name: string | null;
	created_at: string;
	last_author_at: string;
	last_leitung_at: string | null;
	closed_at: string | null;
}

interface MessageRow {
	id: string;
	from_author: number;
	sender_email: string | null;
	sender_name: string | null;
	body: string;
	created_at: string;
}

const toThread = (row: ThreadRow): KummerThread => ({
	id: row.id,
	subject: row.subject,
	recipients: JSON.parse(row.recipients),
	...(row.author_name ? { authorName: row.author_name } : {}),
	createdAt: row.created_at,
	lastAuthorAt: row.last_author_at,
	...(row.last_leitung_at ? { lastLeitungAt: row.last_leitung_at } : {}),
	...(row.closed_at ? { closedAt: row.closed_at } : {})
});

const toMessage = (row: MessageRow): KummerMessage => ({
	id: row.id,
	fromAuthor: !!row.from_author,
	...(row.sender_email ? { senderEmail: row.sender_email } : {}),
	...(row.sender_name ? { senderName: row.sender_name } : {}),
	body: row.body,
	createdAt: row.created_at
});

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const LATEST = 'ORDER BY COALESCE(MAX(last_author_at, COALESCE(last_leitung_at, \'\')), created_at) DESC';

export class SqlKummerStore implements KummerStore {
	#ready: Promise<void> | null = null;

	constructor(private readonly db: SqlDatabase) {}

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

	async create(kummer: NewKummer, authorKey: string, now = new Date().toISOString()): Promise<KummerThread> {
		await this.ready();
		const thread: KummerThread = {
			id: newId(),
			subject: kummer.subject,
			recipients: kummer.recipients,
			...(kummer.authorName ? { authorName: kummer.authorName } : {}),
			createdAt: now,
			lastAuthorAt: now
		};
		await this.db
			.prepare('INSERT INTO kummer_threads (id, subject, recipients, author_key, author_name, created_at, last_author_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(thread.id, thread.subject, JSON.stringify(thread.recipients), authorKey, kummer.authorName ?? null, now, now)
			.run();
		await this.db
			.prepare('INSERT INTO kummer_messages (id, thread_id, from_author, body, created_at) VALUES (?, ?, 1, ?, ?)')
			.bind(newId(), thread.id, kummer.body, now)
			.run();
		await this.markRead(thread.id, `author:${authorKey}`, now);
		return thread;
	}

	async list(): Promise<KummerThread[]> {
		await this.ready();
		const { results } = await this.db.prepare(`SELECT * FROM kummer_threads ${LATEST}`).all<ThreadRow>();
		return results.map(toThread);
	}

	async listByAuthor(authorKey: string): Promise<KummerThread[]> {
		await this.ready();
		const { results } = await this.db.prepare(`SELECT * FROM kummer_threads WHERE author_key = ? ${LATEST}`).bind(authorKey).all<ThreadRow>();
		return results.map(toThread);
	}

	async get(id: string) {
		await this.ready();
		const row = await this.db.prepare('SELECT * FROM kummer_threads WHERE id = ?').bind(id).first<ThreadRow>();
		if (!row) return null;
		const { results } = await this.db
			.prepare('SELECT id, from_author, sender_email, sender_name, body, created_at FROM kummer_messages WHERE thread_id = ? ORDER BY created_at, id')
			.bind(id)
			.all<MessageRow>();
		return { thread: toThread(row), authorKey: row.author_key, messages: results.map(toMessage) };
	}

	async reply(id: string, message: Omit<KummerMessage, 'id' | 'createdAt'>, now = new Date().toISOString()): Promise<void> {
		await this.ready();
		await this.db
			.prepare('INSERT INTO kummer_messages (id, thread_id, from_author, sender_email, sender_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(newId(), id, message.fromAuthor ? 1 : 0, message.fromAuthor ? null : (message.senderEmail ?? null), message.fromAuthor ? null : (message.senderName ?? null), message.body, now)
			.run();
		await this.db.prepare(`UPDATE kummer_threads SET ${message.fromAuthor ? 'last_author_at' : 'last_leitung_at'} = ? WHERE id = ?`).bind(now, id).run();
	}

	async setClosed(id: string, closed: boolean): Promise<void> {
		await this.ready();
		await this.db.prepare('UPDATE kummer_threads SET closed_at = ? WHERE id = ?').bind(closed ? new Date().toISOString() : null, id).run();
	}

	async markRead(id: string, reader: string, now = new Date().toISOString()): Promise<void> {
		await this.ready();
		await this.db
			.prepare('INSERT INTO kummer_reads (thread_id, reader, read_at) VALUES (?, ?, ?) ON CONFLICT (thread_id, reader) DO UPDATE SET read_at = excluded.read_at')
			.bind(id, reader, now)
			.run();
	}

	async readsOf(reader: string): Promise<Map<string, string>> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT thread_id, read_at FROM kummer_reads WHERE reader = ?').bind(reader).all<{ thread_id: string; read_at: string }>();
		return new Map(results.map((row) => [row.thread_id, row.read_at]));
	}

	async countBy(email: string, authorKey: string): Promise<number> {
		await this.ready();
		const row = await this.db
			.prepare('SELECT (SELECT COUNT(*) FROM kummer_threads WHERE author_key = ?) + (SELECT COUNT(*) FROM kummer_messages WHERE sender_email = ?) AS n')
			.bind(authorKey, email)
			.first<{ n: number }>();
		return row?.n ?? 0;
	}

	async forget(email: string, authorKey: string, stand: { email: string; name: string }): Promise<void> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT id FROM kummer_threads WHERE author_key = ?').bind(authorKey).all<{ id: string }>();
		for (const { id } of results) {
			await this.db.prepare('DELETE FROM kummer_messages WHERE thread_id = ?').bind(id).run();
			await this.db.prepare('DELETE FROM kummer_reads WHERE thread_id = ?').bind(id).run();
			await this.db.prepare('DELETE FROM kummer_threads WHERE id = ?').bind(id).run();
		}
		await this.db.prepare('UPDATE kummer_messages SET sender_email = ?, sender_name = ? WHERE sender_email = ?').bind(stand.email, stand.name, email).run();
		await this.db.prepare('DELETE FROM kummer_reads WHERE reader = ?').bind(email).run();
	}
}

export class MemoryKummerStore implements KummerStore {
	private threads = new Map<string, { thread: KummerThread; authorKey: string; messages: KummerMessage[] }>();
	private reads = new Map<string, Map<string, string>>();

	private sorted(entries: { thread: KummerThread }[]) {
		const latest = (thread: KummerThread) => [thread.lastAuthorAt, thread.lastLeitungAt ?? ''].sort().at(-1)!;
		return entries.map((entry) => structuredClone(entry.thread)).sort((a, b) => latest(b).localeCompare(latest(a)));
	}

	async create(kummer: NewKummer, authorKey: string, now = new Date().toISOString()): Promise<KummerThread> {
		const thread: KummerThread = {
			id: newId(),
			subject: kummer.subject,
			recipients: [...kummer.recipients],
			...(kummer.authorName ? { authorName: kummer.authorName } : {}),
			createdAt: now,
			lastAuthorAt: now
		};
		this.threads.set(thread.id, { thread, authorKey, messages: [{ id: newId(), fromAuthor: true, body: kummer.body, createdAt: now }] });
		await this.markRead(thread.id, `author:${authorKey}`, now);
		return structuredClone(thread);
	}

	async list() {
		return this.sorted([...this.threads.values()]);
	}

	async listByAuthor(authorKey: string) {
		return this.sorted([...this.threads.values()].filter((entry) => entry.authorKey === authorKey));
	}

	async get(id: string) {
		const entry = this.threads.get(id);
		return entry ? structuredClone(entry) : null;
	}

	async reply(id: string, message: Omit<KummerMessage, 'id' | 'createdAt'>, now = new Date().toISOString()) {
		const entry = this.threads.get(id);
		if (!entry) return;
		const { senderEmail, senderName } = message;
		entry.messages.push({ id: newId(), fromAuthor: message.fromAuthor, body: message.body, createdAt: now, ...(message.fromAuthor ? {} : { senderEmail, senderName }) });
		if (message.fromAuthor) entry.thread.lastAuthorAt = now;
		else entry.thread.lastLeitungAt = now;
	}

	async setClosed(id: string, closed: boolean) {
		const entry = this.threads.get(id);
		if (!entry) return;
		if (closed) entry.thread.closedAt = new Date().toISOString();
		else delete entry.thread.closedAt;
	}

	async markRead(id: string, reader: string, now = new Date().toISOString()) {
		const reads = this.reads.get(reader) ?? new Map<string, string>();
		reads.set(id, now);
		this.reads.set(reader, reads);
	}

	async readsOf(reader: string) {
		return new Map(this.reads.get(reader) ?? []);
	}

	async countBy(email: string, authorKey: string) {
		const entries = [...this.threads.values()];
		return entries.filter((entry) => entry.authorKey === authorKey).length + entries.flatMap((entry) => entry.messages).filter((message) => message.senderEmail === email).length;
	}

	async forget(email: string, authorKey: string, stand: { email: string; name: string }) {
		for (const [id, entry] of this.threads) {
			if (entry.authorKey === authorKey) {
				this.threads.delete(id);
				for (const reads of this.reads.values()) reads.delete(id);
				continue;
			}
			for (const message of entry.messages) if (message.senderEmail === email) Object.assign(message, { senderEmail: stand.email, senderName: stand.name });
		}
		this.reads.delete(email);
	}
}
