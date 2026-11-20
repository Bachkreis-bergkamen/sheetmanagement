import { DatabaseSync } from 'node:sqlite';
import type { D1, D1Statement } from './sql.ts';

/* For tests only: the app never imports this, and Workers have no node:sqlite. */

/** D1's API over Node's built-in SQLite, so the SQL and the migrations are tested for real. */
export function localD1(): D1 {
	const db = new DatabaseSync(':memory:');
	// As in D1, where links are always checked.
	db.exec('PRAGMA foreign_keys = ON');
	const statement = (sql: string, values: unknown[] = []): D1Statement => {
		// As in D1, which allows at most 5 terms in a compound SELECT (a VALUES list doesn't count); Node's SQLite allows 500.
		if (sql.split(/\b(?:UNION|INTERSECT|EXCEPT)\b/).length > 5) throw new Error('D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR');
		return {
			bind: (...next) => statement(sql, next),
			all: async <T>() => ({ results: db.prepare(sql).all(...values) as T[] }),
			first: async <T>() => (db.prepare(sql).get(...values) as T) ?? null,
			run: async () => db.prepare(sql).run(...values)
		};
	};
	return {
		prepare: (sql) => statement(sql),
		async batch(list) {
			db.exec('BEGIN');
			try {
				const results = [];
				for (const item of list) results.push(await item.run());
				db.exec('COMMIT');
				return results;
			} catch (cause) {
				db.exec('ROLLBACK');
				throw cause;
			}
		}
	};
}
