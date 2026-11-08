import { sqlData } from './data-sql.ts';
import { sqlTickets } from './tickets-sql.ts';
import { fingerprint, type ErrorGroup, type ErrorSource } from '#lib/errors/errors.ts';
import { reminderKey, type Account, type MarkShare, type PageCount, type PageMarks, type PartCheck, type PracticeDay, type PushDevice, type SentReminder, type Store, type TourOutcome } from './types.ts';

type ErrorRow = { fingerprint: string; source: ErrorSource; place: string; message: string; status: number | null; count: number; first_at: string; last_at: string; notified: number };
const errorFrom = (row: ErrorRow): ErrorGroup => ({
	fingerprint: row.fingerprint,
	source: row.source,
	place: row.place,
	message: row.message,
	...(row.status ? { status: row.status } : {}),
	count: row.count,
	firstAt: row.first_at,
	lastAt: row.last_at,
	notified: !!row.notified
});

type ShareRow = { id: string; sender: string; file: string; pages: string; created_at: string };
const shareFrom = (row: ShareRow): MarkShare => ({ id: row.id, sender: row.sender, file: row.file, pages: JSON.parse(row.pages), at: row.created_at });

/** The part of a Cloudflare D1 binding this app uses. Plain SQL, no ORM. */
export interface D1 {
	prepare(sql: string): D1Statement;
	batch(statements: D1Statement[]): Promise<unknown[]>;
}

export interface D1Statement {
	bind(...values: unknown[]): D1Statement;
	all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
	first<T = Record<string, unknown>>(): Promise<T | null>;
	run(): Promise<unknown>;
}

/** The files in migrations/, by name, in order. The same files `wrangler d1 migrations apply` uses. */
export const MIGRATIONS: [name: string, sql: string][] = Object.entries(
	import.meta.glob<string>('/migrations/*.sql', { query: '?raw', import: 'default', eager: true })
)
	.map(([path, sql]): [string, string] => [path.split('/').pop()!, sql])
	.sort(([a], [b]) => a.localeCompare(b));

/** Wrangler's own bookkeeping table, so the app and `wrangler d1 migrations apply` agree on what ran. */
const BOOKKEEPING = `CREATE TABLE IF NOT EXISTS d1_migrations(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT UNIQUE,
	applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

/** A migration file as single statements: D1 prepares one at a time. */
export function statements(sql: string): string[] {
	return sql
		.split('\n')
		.filter((line) => !line.trim().startsWith('--'))
		.join('\n')
		.split(';')
		.map((statement) => statement.trim())
		.filter(Boolean);
}

export function sqlStore(db: D1): Store {
	// Once per isolate: the schema is checked before the first query, not on every one.
	let ready: Promise<unknown> | undefined;
	const schema = () => (ready ??= migrate().catch((cause: unknown) => ((ready = undefined), Promise.reject(cause))));
	const all = async <T>(sql: string, ...values: unknown[]) => (await schema(), (await db.prepare(sql).bind(...values).all<T>()).results);
	const run = async (sql: string, ...values: unknown[]) => (await schema(), await db.prepare(sql).bind(...values).run());

	async function applied(): Promise<string[]> {
		await db.prepare(BOOKKEEPING).run();
		return (await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all<{ name: string }>()).results.map((row) => row.name);
	}

	async function migrate(): Promise<string[]> {
		const done = new Set(await applied());
		const added: string[] = [];
		for (const [name, sql] of MIGRATIONS) {
			if (done.has(name)) continue;
			// One batch is one transaction: the tables and the bookkeeping row land together.
			try {
				await db.batch([...statements(sql).map((statement) => db.prepare(statement)), db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').bind(name)]);
				added.push(name);
			} catch (cause) {
				// Another instance applied it at the same moment: fine, the statements are idempotent.
				if (!(await applied()).includes(name)) throw cause;
			}
		}
		return added;
	}

	return {
		kind: 'd1',
		async schemaVersion() {
			return (await applied()).at(-1) ?? null;
		},
		migrate,

		async savePush(device) {
			await run(
				`INSERT INTO push_subscriptions (endpoint, email, p256dh, auth) VALUES (?, ?, ?, ?)
				 ON CONFLICT (endpoint) DO UPDATE SET email = excluded.email, p256dh = excluded.p256dh, auth = excluded.auth`,
				device.endpoint,
				device.email,
				device.p256dh,
				device.auth
			);
		},
		async deletePush(endpoint) {
			await run('DELETE FROM push_subscriptions WHERE endpoint = ?', endpoint);
		},
		pushOf: (email) =>
			all<PushDevice>('SELECT endpoint, email, p256dh, auth, created_at AS createdAt FROM push_subscriptions WHERE email = ? ORDER BY created_at', email),
		allPush: () => all<PushDevice>('SELECT endpoint, email, p256dh, auth FROM push_subscriptions ORDER BY email, created_at'),

		async sentReminders(kind, subjects) {
			const sent = new Set<string>();
			// D1 binds at most 100 values per statement.
			for (let i = 0; i < subjects.length; i += 90) {
				const chunk = subjects.slice(i, i + 90);
				const rows = await all<{ subject: string; recipient: string }>(
					`SELECT subject, recipient FROM reminders_sent WHERE kind = ? AND subject IN (${chunk.map(() => '?').join(', ')})`,
					kind,
					...chunk
				);
				for (const row of rows) sent.add(reminderKey(row.subject, row.recipient));
			}
			return sent;
		},
		async logReminder(kind, subject, recipient) {
			await run('INSERT OR IGNORE INTO reminders_sent (kind, subject, recipient) VALUES (?, ?, ?)', kind, subject, recipient);
		},
		remindersOf: (recipient) =>
			all<SentReminder>('SELECT kind, subject, sent_at AS sentAt FROM reminders_sent WHERE recipient = ? ORDER BY sent_at, kind, subject', recipient),
		async deleteRemindersOf(recipient) {
			await run('DELETE FROM reminders_sent WHERE recipient = ?', recipient);
		},
		async pruneReminders(days) {
			await run(`DELETE FROM reminders_sent WHERE sent_at < datetime('now', ?)`, `-${days} days`);
		},

		async mailOptOuts() {
			return new Set((await all<{ email: string }>('SELECT email FROM email_opt_out')).map((row) => row.email));
		},
		async setMailOptOut(email, off) {
			if (off) await run('INSERT OR IGNORE INTO email_opt_out (email) VALUES (?)', email);
			else await run('DELETE FROM email_opt_out WHERE email = ?', email);
		},

		async accountOf(email) {
			const [row] = await all<Account>('SELECT email, password_hash AS passwordHash, stamp FROM accounts WHERE email = ?', email);
			return row ?? null;
		},
		async saveAccount({ email, passwordHash, stamp }) {
			await run(
				`INSERT INTO accounts (email, password_hash, stamp) VALUES (?, ?, ?)
				 ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash, stamp = excluded.stamp, updated_at = datetime('now')`,
				email,
				passwordHash,
				stamp
			);
		},
		async deleteAccount(email) {
			await run('DELETE FROM accounts WHERE email = ?', email);
		},

		async countPage(day, route, role) {
			await run(`INSERT INTO page_counts (day, route, role, views) VALUES (?, ?, ?, 1) ON CONFLICT (day, route, role) DO UPDATE SET views = views + 1`, day, route, role);
		},
		async pageCounts(since) {
			return all<PageCount>(
				'SELECT route, role, SUM(views) AS views FROM page_counts WHERE day >= ? GROUP BY route, role ORDER BY views DESC, route, role',
				since
			);
		},
		async prunePageCounts(before) {
			await run('DELETE FROM page_counts WHERE day < ?', before);
		},

		async tourOf(email) {
			const [row] = await all<{ outcome: TourOutcome }>('SELECT outcome FROM tour_seen WHERE email = ?', email);
			return row?.outcome ?? null;
		},
		async setTour(email, outcome) {
			if (outcome) await run(`INSERT INTO tour_seen (email, outcome) VALUES (?, ?) ON CONFLICT (email) DO UPDATE SET outcome = excluded.outcome, created_at = datetime('now')`, email, outcome);
			else await run('DELETE FROM tour_seen WHERE email = ?', email);
		},

		async practiceOn(email) {
			return (await all('SELECT 1 FROM practice_opt_in WHERE email = ?', email)).length > 0;
		},
		async setPracticeOn(email, on) {
			if (on) await run('INSERT OR IGNORE INTO practice_opt_in (email) VALUES (?)', email);
			else await run('DELETE FROM practice_opt_in WHERE email = ?', email);
		},
		async addPractice(email, day, seconds, cap) {
			await run(
				`INSERT INTO practice_days (email, day, seconds) VALUES (?, ?, MIN(?, ?))
				 ON CONFLICT (email, day) DO UPDATE SET seconds = MIN(seconds + excluded.seconds, ?)`,
				email,
				day,
				seconds,
				cap,
				cap
			);
		},
		practiceOf: (email) => all<PracticeDay>('SELECT day, seconds FROM practice_days WHERE email = ? ORDER BY day', email),
		async deletePractice(email) {
			await run('DELETE FROM practice_days WHERE email = ?', email);
		},
		async marksOf(email, file) {
			const rows = await all<{ file: string; page: number; strokes: string }>(
				`SELECT file, page, strokes FROM practice_marks WHERE email = ?${file === undefined ? '' : ' AND file = ?'} ORDER BY file, page`,
				...(file === undefined ? [email] : [email, file])
			);
			return rows.map((row): PageMarks => ({ file: row.file, page: row.page, strokes: JSON.parse(row.strokes) }));
		},
		async saveMarks(email, file, page, strokes) {
			if (!strokes.length) await run('DELETE FROM practice_marks WHERE email = ? AND file = ? AND page = ?', email, file, page);
			else
				await run(
					`INSERT INTO practice_marks (email, file, page, strokes) VALUES (?, ?, ?, ?)
					 ON CONFLICT (email, file, page) DO UPDATE SET strokes = excluded.strokes, updated_at = datetime('now')`,
					email,
					file,
					page,
					JSON.stringify(strokes)
				);
		},
		async deleteMarks(email) {
			await run('DELETE FROM practice_marks WHERE email = ?', email);
			await run('DELETE FROM mark_share_answers WHERE email = ? OR share IN (SELECT id FROM mark_shares WHERE sender = ?)', email, email);
			await run('DELETE FROM mark_shares WHERE sender = ?', email);
		},

		async shareMarks(sender, file, pages) {
			const id = crypto.randomUUID();
			// A new offer: everyone answers it anew.
			await run('DELETE FROM mark_share_answers WHERE share IN (SELECT id FROM mark_shares WHERE sender = ? AND file = ?)', sender, file);
			await run(
				`INSERT INTO mark_shares (id, sender, file, pages) VALUES (?, ?, ?, ?)
				 ON CONFLICT (sender, file) DO UPDATE SET id = excluded.id, pages = excluded.pages, created_at = datetime('now')`,
				id,
				sender,
				file,
				JSON.stringify(pages)
			);
			return (await this.shareById(id))!;
		},
		async unshareMarks(sender, file) {
			await run('DELETE FROM mark_share_answers WHERE share IN (SELECT id FROM mark_shares WHERE sender = ? AND file = ?)', sender, file);
			await run('DELETE FROM mark_shares WHERE sender = ? AND file = ?', sender, file);
		},
		async shareById(id) {
			const [row] = await all<ShareRow>('SELECT id, sender, file, pages, created_at FROM mark_shares WHERE id = ?', id);
			return row ? shareFrom(row) : null;
		},
		async shareOf(sender, file) {
			const [row] = await all<ShareRow>('SELECT id, sender, file, pages, created_at FROM mark_shares WHERE sender = ? AND file = ?', sender, file);
			return row ? shareFrom(row) : null;
		},
		async sharesFor(email, file) {
			const rows = await all<ShareRow>(
				`SELECT id, sender, file, pages, created_at FROM mark_shares
				 WHERE file = ? AND sender != ? AND id NOT IN (SELECT share FROM mark_share_answers WHERE email = ?)
				 ORDER BY created_at DESC, id`,
				file,
				email,
				email
			);
			return rows.map(shareFrom);
		},
		async answerShare(id, email, answer) {
			await run(
				`INSERT INTO mark_share_answers (share, email, answer) VALUES (?, ?, ?)
				 ON CONFLICT (share, email) DO UPDATE SET answer = excluded.answer, answered_at = datetime('now')`,
				id,
				email,
				answer
			);
		},

		async partChecks() {
			const rows = await all<{ file_id: string; modified: string; pages: number | null; skipped: number; dismissed: number }>(
				'SELECT file_id, modified, pages, skipped, dismissed FROM part_checks'
			);
			return rows.map((row): PartCheck => ({ fileId: row.file_id, modified: row.modified, pages: row.pages, skipped: !!row.skipped, dismissed: !!row.dismissed }));
		},
		async savePartCheck(check) {
			await run(
				`INSERT INTO part_checks (file_id, modified, pages, skipped) VALUES (?, ?, ?, ?)
				 ON CONFLICT (file_id) DO UPDATE SET
					dismissed = CASE WHEN modified = excluded.modified THEN dismissed ELSE 0 END,
					modified = excluded.modified, pages = excluded.pages, skipped = excluded.skipped, checked_at = datetime('now')`,
				check.fileId,
				check.modified,
				check.pages,
				check.skipped ? 1 : 0
			);
		},
		async dismissPartCheck(fileId) {
			await run('UPDATE part_checks SET dismissed = 1 WHERE file_id = ?', fileId);
		},
		async clearPartChecks() {
			await run('DELETE FROM part_checks');
		},

		async logError(report) {
			await run(
				`INSERT INTO error_log (fingerprint, source, place, message, status) VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT (fingerprint) DO UPDATE SET count = count + 1, last_at = datetime('now'), status = excluded.status`,
				fingerprint(report),
				report.source,
				report.place,
				report.message,
				report.status ?? null
			);
		},
		async errorLog(days) {
			const rows = await all<ErrorRow>(
				`SELECT fingerprint, source, place, message, status, count, first_at, last_at, notified FROM error_log
				 WHERE last_at >= datetime('now', ?) ORDER BY last_at DESC LIMIT 200`,
				`-${days} days`
			);
			return rows.map(errorFrom);
		},
		async markErrorsNotified(fingerprints) {
			for (let i = 0; i < fingerprints.length; i += 90) {
				const chunk = fingerprints.slice(i, i + 90);
				await run(`UPDATE error_log SET notified = 1 WHERE fingerprint IN (${chunk.map(() => '?').join(', ')})`, ...chunk);
			}
		},
		async pruneErrors(days) {
			if (days <= 0) await run('DELETE FROM error_log');
			else await run(`DELETE FROM error_log WHERE last_at < datetime('now', ?)`, `-${days} days`);
		},

		...sqlData(db, schema),
		...sqlTickets(db, schema),

		async hit(key, windowMinutes) {
			const since = `-${windowMinutes} minutes`;
			const [row] = await all<{ count: number }>(
				`INSERT INTO rate_limits (key, count) VALUES (?, 1)
				 ON CONFLICT (key) DO UPDATE SET
					count = CASE WHEN window_start < datetime('now', ?) THEN 1 ELSE count + 1 END,
					window_start = CASE WHEN window_start < datetime('now', ?) THEN datetime('now') ELSE window_start END
				 RETURNING count`,
				key,
				since,
				since
			);
			// Old windows are of no use any more; a day covers every limit the app has.
			await run(`DELETE FROM rate_limits WHERE window_start < datetime('now', '-1 day')`);
			return row?.count ?? 1;
		},

		async getState(key) {
			await schema();
			return (await db.prepare('SELECT value FROM job_state WHERE key = ?').bind(key).first<{ value: string }>())?.value ?? null;
		},
		async setState(key, value) {
			await run(
				`INSERT INTO job_state (key, value) VALUES (?, ?)
				 ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
				key,
				value
			);
		}
	};
}
