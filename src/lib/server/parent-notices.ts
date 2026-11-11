import { env } from 'cloudflare:workers';
import { splitGroups } from '#lib/access/access.ts';
import type { NewParentNotice, ParentNotice } from '#lib/parents/notices.ts';
import { isDemo } from './env.ts';
import type { SqlDatabase } from './polls-store.ts';

/**
 * Where the notices to parents are kept: in the app's database (D1), in memory for the demo;
 * never in the sheet. See #lib/parents/notices.ts.
 */

export interface ParentNoticeStore {
	/** Newest first. */
	list(): Promise<ParentNotice[]>;
	create(notice: NewParentNotice, now?: string): Promise<ParentNotice>;
	remove(id: string): Promise<void>;
}

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS parent_notices (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		body TEXT NOT NULL,
		orchestras TEXT NOT NULL,
		by_email TEXT NOT NULL,
		by_name TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`
];

interface NoticeRow {
	id: string;
	title: string;
	body: string;
	orchestras: string;
	by_name: string;
	created_at: string;
}

export class SqlParentNoticeStore implements ParentNoticeStore {
	#ready: Promise<void> | null = null;

	constructor(private readonly db: SqlDatabase) {}

	/** The table is made on first use, so a new D1 database needs no setup step. */
	private ready(): Promise<void> {
		this.#ready ??= (async () => {
			for (const statement of SCHEMA) await this.db.prepare(statement).run();
		})().catch((cause) => {
			this.#ready = null;
			throw cause;
		});
		return this.#ready;
	}

	async list(): Promise<ParentNotice[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT id, title, body, orchestras, by_name, created_at FROM parent_notices ORDER BY created_at DESC').all<NoticeRow>();
		return results.map((row) => ({ id: row.id, title: row.title, body: row.body, orchestras: splitGroups(row.orchestras), byName: row.by_name, createdAt: row.created_at }));
	}

	async create(notice: NewParentNotice, now = new Date().toISOString()): Promise<ParentNotice> {
		await this.ready();
		const id = newId();
		await this.db
			.prepare('INSERT INTO parent_notices (id, title, body, orchestras, by_email, by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(id, notice.title, notice.body, notice.orchestras.join(', '), notice.byEmail, notice.byName, now)
			.run();
		return { id, title: notice.title, body: notice.body, orchestras: notice.orchestras, byName: notice.byName, createdAt: now };
	}

	async remove(id: string): Promise<void> {
		await this.ready();
		await this.db.prepare('DELETE FROM parent_notices WHERE id = ?').bind(id).run();
	}
}

export class MemoryParentNoticeStore implements ParentNoticeStore {
	#notices: ParentNotice[] = [];

	async list(): Promise<ParentNotice[]> {
		return [...this.#notices].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	async create(notice: NewParentNotice, now = new Date().toISOString()): Promise<ParentNotice> {
		const created = { id: newId(), title: notice.title, body: notice.body, orchestras: notice.orchestras, byName: notice.byName, createdAt: now };
		this.#notices.push(created);
		return created;
	}

	async remove(id: string): Promise<void> {
		this.#notices = this.#notices.filter((notice) => notice.id !== id);
	}
}

let demo: MemoryParentNoticeStore | null = null;

/** In D1 (binding "DB"), in memory for the demo; null without a database. */
export function parentNoticeStore(): ParentNoticeStore | null {
	if (isDemo()) return (demo ??= new MemoryParentNoticeStore());
	const db = (env as { DB?: SqlDatabase }).DB;
	return db ? new SqlParentNoticeStore(db) : null;
}

/** Back to empty, with the rest of the demo. */
export function resetDemoParentNotices() {
	demo = null;
}
