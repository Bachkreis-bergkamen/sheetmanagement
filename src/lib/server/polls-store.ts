import type { D1 } from './db/sql.ts';
import type { NewPoll, Poll, PollResponse } from '#lib/polls/polls.ts';

/**
 * Where date polls (#95) are kept. In D1 with plain SQL on a deployment, in memory for the
 * demo; both behave the same, and the tests run the SQL against SQLite.
 */
/**
 * One store per database binding, kept between requests (#346): a store makes its tables on
 * first use and remembers that it did, which a new store on every call never could.
 */
export function perDatabase<T>(make: (db: D1) => T): (db: D1) => T {
	let kept: { db: D1; store: T } | undefined;
	return (db) => {
		if (kept?.db !== db) kept = { db, store: make(db) };
		return kept.store;
	};
}

export interface PollStore {
	list(): Promise<Poll[]>;
	get(id: string): Promise<{ poll: Poll; responses: PollResponse[] } | null>;
	/** The polls not closed yet that this person hasn't answered, newest first: one query for "Wartet auf dich" (#347). */
	unanswered(email: string): Promise<Poll[]>;
	create(poll: NewPoll, by: { email: string; name: string }): Promise<Poll>;
	/** One row per person and poll: answering again replaces the earlier answer. */
	respond(id: string, response: PollResponse): Promise<void>;
	close(id: string, chosen: string[]): Promise<void>;
	reopen(id: string): Promise<void>;
	remove(id: string): Promise<void>;
	/** One person's answers, with the poll's title and options; for their data export (#158). */
	answersOf(email: string): Promise<{ poll: Poll; response: PollResponse }[]>;
	/** How many answers and polls carry this address; for the preview of "Mitglied löschen" (#158). */
	countBy(email: string): Promise<number>;
	/** Puts a pseudonym in place of the person, so the answers still count but aren't theirs (#158). */
	forget(email: string, stand: { email: string; name: string }): Promise<void>;
}

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS polls (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		note TEXT,
		options TEXT NOT NULL,
		groups_json TEXT NOT NULL,
		deadline TEXT,
		created_by TEXT NOT NULL,
		created_by_name TEXT NOT NULL,
		created_at TEXT NOT NULL,
		closed_at TEXT,
		chosen TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS poll_responses (
		poll_id TEXT NOT NULL,
		email TEXT NOT NULL,
		name TEXT NOT NULL,
		choices TEXT NOT NULL,
		comment TEXT,
		updated_at TEXT NOT NULL,
		PRIMARY KEY (poll_id, email)
	)`
];

interface PollRow {
	id: string;
	title: string;
	note: string | null;
	options: string;
	groups_json: string;
	deadline: string | null;
	created_by: string;
	created_by_name: string;
	created_at: string;
	closed_at: string | null;
	chosen: string | null;
}

interface ResponseRow {
	email: string;
	name: string;
	choices: string;
	comment: string | null;
	updated_at: string;
}

const toPoll = (row: PollRow): Poll => ({
	id: row.id,
	title: row.title,
	note: row.note ?? undefined,
	options: JSON.parse(row.options),
	groups: JSON.parse(row.groups_json),
	deadline: row.deadline ?? undefined,
	createdBy: row.created_by,
	createdByName: row.created_by_name,
	createdAt: row.created_at,
	closedAt: row.closed_at ?? undefined,
	// Comma-separated option ids; one id from before #209 reads the same.
	chosen: row.chosen ? row.chosen.split(',') : []
});

const toResponse = (row: ResponseRow): PollResponse => ({
	email: row.email,
	name: row.name,
	choices: JSON.parse(row.choices),
	comment: row.comment ?? undefined,
	updatedAt: row.updated_at
});

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

export class SqlPollStore implements PollStore {
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

	async list(): Promise<Poll[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM polls ORDER BY created_at DESC').all<PollRow>();
		return results.map(toPoll);
	}

	async get(id: string) {
		await this.ready();
		const row = await this.db.prepare('SELECT * FROM polls WHERE id = ?').bind(id).first<PollRow>();
		if (!row) return null;
		const { results } = await this.db
			.prepare('SELECT email, name, choices, comment, updated_at FROM poll_responses WHERE poll_id = ? ORDER BY name')
			.bind(id)
			.all<ResponseRow>();
		return { poll: toPoll(row), responses: results.map(toResponse) };
	}

	async unanswered(email: string): Promise<Poll[]> {
		await this.ready();
		const { results } = await this.db
			.prepare(
				`SELECT * FROM polls WHERE closed_at IS NULL
				AND NOT EXISTS (SELECT 1 FROM poll_responses WHERE poll_id = polls.id AND email = ?) ORDER BY created_at DESC`
			)
			.bind(email)
			.all<PollRow>();
		return results.map(toPoll);
	}

	async create(poll: NewPoll, by: { email: string; name: string }): Promise<Poll> {
		await this.ready();
		const created: Poll = { ...poll, id: newId(), createdBy: by.email, createdByName: by.name, createdAt: new Date().toISOString(), chosen: [] };
		await this.db
			.prepare(
				'INSERT INTO polls (id, title, note, options, groups_json, deadline, created_by, created_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(
				created.id,
				created.title,
				created.note ?? null,
				JSON.stringify(created.options),
				JSON.stringify(created.groups),
				created.deadline ?? null,
				created.createdBy,
				created.createdByName,
				created.createdAt
			)
			.run();
		return created;
	}

	async respond(id: string, response: PollResponse): Promise<void> {
		await this.ready();
		await this.db
			.prepare(
				`INSERT INTO poll_responses (poll_id, email, name, choices, comment, updated_at) VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT (poll_id, email) DO UPDATE SET name = excluded.name, choices = excluded.choices, comment = excluded.comment, updated_at = excluded.updated_at`
			)
			.bind(id, response.email, response.name, JSON.stringify(response.choices), response.comment ?? null, response.updatedAt)
			.run();
	}

	async close(id: string, chosen: string[]): Promise<void> {
		await this.ready();
		await this.db
			.prepare('UPDATE polls SET closed_at = ?, chosen = ? WHERE id = ?')
			.bind(new Date().toISOString(), chosen.length ? chosen.join(',') : null, id)
			.run();
	}

	async reopen(id: string): Promise<void> {
		await this.ready();
		await this.db.prepare('UPDATE polls SET closed_at = NULL, chosen = NULL WHERE id = ?').bind(id).run();
	}

	async remove(id: string): Promise<void> {
		await this.ready();
		// Together (#351): a poll never stays without its answers or the other way round.
		await this.db.batch([this.db.prepare('DELETE FROM poll_responses WHERE poll_id = ?').bind(id), this.db.prepare('DELETE FROM polls WHERE id = ?').bind(id)]);
	}

	async answersOf(email: string) {
		await this.ready();
		const { results } = await this.db
			.prepare(
				`SELECT p.*, r.email, r.name, r.choices, r.comment, r.updated_at FROM poll_responses r JOIN polls p ON p.id = r.poll_id
				WHERE r.email = ? ORDER BY p.created_at`
			)
			.bind(email)
			.all<PollRow & ResponseRow>();
		return results.map((row) => ({ poll: toPoll(row), response: toResponse(row) }));
	}

	async countBy(email: string): Promise<number> {
		await this.ready();
		const row = await this.db
			.prepare('SELECT (SELECT COUNT(*) FROM poll_responses WHERE email = ?) + (SELECT COUNT(*) FROM polls WHERE created_by = ?) AS n')
			.bind(email, email)
			.first<{ n: number }>();
		return row?.n ?? 0;
	}

	async forget(email: string, stand: { email: string; name: string }): Promise<void> {
		await this.ready();
		await this.db.prepare('UPDATE poll_responses SET email = ?, name = ?, comment = NULL WHERE email = ?').bind(stand.email, stand.name, email).run();
		await this.db.prepare('UPDATE polls SET created_by = ?, created_by_name = ? WHERE created_by = ?').bind(stand.email, stand.name, email).run();
	}
}

export class MemoryPollStore implements PollStore {
	private polls = new Map<string, Poll>();
	private responses = new Map<string, Map<string, PollResponse>>();

	async list(): Promise<Poll[]> {
		return [...this.polls.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((poll) => structuredClone(poll));
	}

	async get(id: string) {
		const poll = this.polls.get(id);
		if (!poll) return null;
		const responses = [...(this.responses.get(id)?.values() ?? [])].sort((a, b) => a.name.localeCompare(b.name));
		return structuredClone({ poll, responses });
	}

	async unanswered(email: string): Promise<Poll[]> {
		return (await this.list()).filter((poll) => !poll.closedAt && !this.responses.get(poll.id)?.has(email));
	}

	async create(poll: NewPoll, by: { email: string; name: string }, createdAt = new Date().toISOString()): Promise<Poll> {
		const created: Poll = { ...structuredClone(poll), id: newId(), createdBy: by.email, createdByName: by.name, createdAt, chosen: [] };
		this.polls.set(created.id, created);
		return structuredClone(created);
	}

	async respond(id: string, response: PollResponse): Promise<void> {
		if (!this.polls.has(id)) return;
		const answers = this.responses.get(id) ?? new Map<string, PollResponse>();
		answers.set(response.email, structuredClone(response));
		this.responses.set(id, answers);
	}

	async close(id: string, chosen: string[]): Promise<void> {
		const poll = this.polls.get(id);
		if (poll) Object.assign(poll, { closedAt: new Date().toISOString(), chosen });
	}

	async reopen(id: string): Promise<void> {
		const poll = this.polls.get(id);
		if (poll) Object.assign(poll, { closedAt: undefined, chosen: [] });
	}

	async remove(id: string): Promise<void> {
		this.polls.delete(id);
		this.responses.delete(id);
	}

	async answersOf(email: string) {
		return [...this.responses]
			.flatMap(([id, answers]) => {
				const poll = this.polls.get(id);
				const response = answers.get(email);
				return poll && response ? [structuredClone({ poll, response })] : [];
			})
			.sort((a, b) => a.poll.createdAt.localeCompare(b.poll.createdAt));
	}

	async countBy(email: string): Promise<number> {
		const answers = [...this.responses.values()].filter((answers) => answers.has(email)).length;
		return answers + [...this.polls.values()].filter((poll) => poll.createdBy === email).length;
	}

	async forget(email: string, stand: { email: string; name: string }): Promise<void> {
		for (const answers of this.responses.values()) {
			const answer = answers.get(email);
			if (!answer) continue;
			answers.delete(email);
			answers.set(stand.email, { ...answer, email: stand.email, name: stand.name, comment: undefined });
		}
		for (const poll of this.polls.values()) if (poll.createdBy === email) Object.assign(poll, { createdBy: stand.email, createdByName: stand.name });
	}
}
