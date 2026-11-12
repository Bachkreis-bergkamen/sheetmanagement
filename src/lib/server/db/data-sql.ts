import type { TabKey } from '#lib/repertoire/sheet.ts';
import { constraintError, DataCheckError, decode, encode, LinkIndex, namedRowsOf, SCHEMA, sqlColumns, TAB_ORDER, type SqlRow } from './schema.ts';
import type { D1, D1Statement } from './sql.ts';
import type { DataRow, Store } from './types.ts';

/**
 * The orchestra's data in D1 (#186), one table per tab (schema.ts). Every change is one batch,
 * so it lands whole or not at all, and counts the data version up for the caches. A save or
 * delete names the revision of each row it read; the write guard makes the batch fail if one
 * changed since, so a save never overwrites someone else's newer one.
 */

type DataMethods = Pick<Store, 'dataState' | 'setDataSource' | 'readData' | 'addDataTab' | 'appendData' | 'updateData' | 'deleteData' | 'replaceData' | 'importData'>;

const quote = (name: string) => `"${name}"`;
const tableOf = (tab: TabKey) => quote(SCHEMA[tab].table);

/** A value written into the statement itself: imports carry thousands of rows, more than D1 binds. */
function literal(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return 'NULL';
	if (typeof value === 'number') return String(Math.trunc(value));
	return `'${value.replace(/\0/g, '').replace(/'/g, "''")}'`;
}

/** Below D1's 100 KB per statement. */
const STATEMENT_BYTES = 90_000;

export function sqlData(db: D1, schema: () => Promise<unknown>): DataMethods {
	const all = async <T>(sql: string, ...values: unknown[]) => (await schema(), (await db.prepare(sql).bind(...values).all<T>()).results);

	const setState = (key: string, value: string) =>
		db.prepare(`INSERT INTO job_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).bind(key, value);
	/** Every change to the data counts its version up, in the same batch, so caches know. */
	const bump = () =>
		db.prepare(`INSERT INTO job_state (key, value) VALUES ('data-version', '1') ON CONFLICT (key) DO UPDATE SET value = CAST(value AS INTEGER) + 1, updated_at = datetime('now')`);
	/** Fails the batch when the statement before it changed no row: that row changed since it was read. */
	const guard = () => db.prepare('INSERT INTO write_guard (changed) VALUES (changes())');
	const clearGuard = () => db.prepare('DELETE FROM write_guard');

	/** The tabs a tab's links point into, itself included. */
	const withTargets = (tabs: TabKey[]) => [...new Set(tabs.flatMap((tab) => [tab, ...Object.values(SCHEMA[tab].links ?? {}).map((link) => link.tab)]))];

	async function rowsOf(tabs: TabKey[]): Promise<Map<TabKey, SqlRow[]>> {
		const lists = await Promise.all(tabs.map((tab) => all<SqlRow>(`SELECT * FROM ${tableOf(tab)} ORDER BY id`)));
		return new Map(tabs.map((tab, i) => [tab, lists[i]]));
	}

	/** The rows links in `tab` can point to, by their name. */
	async function linkIndex(tab: TabKey): Promise<LinkIndex> {
		const index = new LinkIndex();
		const targets = withTargets([tab]).filter((other) => other !== tab || SCHEMA[tab].links);
		for (const [target, rows] of await rowsOf(targets)) for (const row of rows) index.add(target, Number(row.id), row);
		return index;
	}

	const insert = (tab: TabKey, row: SqlRow) => {
		const columns = sqlColumns(tab);
		return db.prepare(`INSERT INTO ${tableOf(tab)} (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).bind(...columns.map((column) => row[column] ?? null));
	};

	/** Runs a batch; SQLite's refusals come back as the app's errors. */
	async function write(tab: TabKey, statements: D1Statement[]) {
		await schema();
		try {
			await db.batch(statements);
		} catch (cause) {
			throw constraintError(tab, cause) ?? cause;
		}
	}

	return {
		async dataState() {
			const rows = await all<{ key: string; value: string }>(`SELECT key, value FROM job_state WHERE key IN ('data-source', 'data-version')`);
			const value = (key: string) => rows.find((row) => row.key === key)?.value;
			return { source: value('data-source') === 'd1' ? 'd1' : 'sheet', version: Number(value('data-version') ?? 0) };
		},
		async setDataSource(source) {
			await schema();
			await db.batch([setState('data-source', source), bump()]);
		},
		async readData(tabs) {
			const present = (await all<{ tab: TabKey }>('SELECT tab FROM data_tabs')).map((row) => row.tab).filter((tab) => tab in SCHEMA && (!tabs || tabs.includes(tab)));
			const rows = await rowsOf(withTargets(present));
			const byId = new Map([...rows].map(([tab, list]) => [tab, new Map(list.map((row) => [Number(row.id), row]))]));
			const target = (tab: TabKey, id: number) => byId.get(tab)?.get(id);
			const named = namedRowsOf(byId);
			return Object.fromEntries(
				present.map((tab) => [tab, (rows.get(tab) ?? []).map((row): DataRow => ({ id: Number(row.id), rev: Number(row.rev), cells: decode(tab, row, target, named) }))])
			);
		},
		async addDataTab(tab) {
			await write(tab, [db.prepare('INSERT OR IGNORE INTO data_tabs (tab) VALUES (?)').bind(tab), bump()]);
		},
		async appendData(tab, list) {
			if (!list.length) return;
			const index = await linkIndex(tab);
			await write(tab, [...list.map((cells) => insert(tab, encode(tab, cells, index.resolve))), bump()]);
		},
		async updateData(tab, list) {
			if (!list.length) return;
			const index = await linkIndex(tab);
			const columns = sqlColumns(tab);
			await write(tab, [
				...list.flatMap(({ id, rev, cells }) => {
					const row = encode(tab, cells, index.resolve);
					return [
						db
							.prepare(`UPDATE ${tableOf(tab)} SET ${columns.map((column) => `${quote(column)} = ?`).join(', ')}, rev = rev + 1, updated_at = datetime('now') WHERE id = ? AND rev = ?`)
							.bind(...columns.map((column) => row[column] ?? null), id, rev),
						guard()
					];
				}),
				clearGuard(),
				bump()
			]);
		},
		async deleteData(tab, list) {
			if (!list.length) return;
			// SQLite doesn't say which link holds a row: something still points to it.
			await write(tab, [...list.flatMap(({ id, rev }) => [db.prepare(`DELETE FROM ${tableOf(tab)} WHERE id = ? AND rev = ?`).bind(id, rev), guard()]), clearGuard(), bump()]).catch(
				(cause) => Promise.reject(cause instanceof DataCheckError && cause.kind === 'link' ? new DataCheckError('used', tab, '', '') : cause)
			);
		},
		async replaceData(tab, list) {
			const index = await linkIndex(tab);
			const rows = list.map((cells) => encode(tab, cells, index.resolve));
			await write(tab, [db.prepare(`DELETE FROM ${tableOf(tab)}`), db.prepare('INSERT OR IGNORE INTO data_tabs (tab) VALUES (?)').bind(tab), ...rows.map((row) => insert(tab, row)), bump()]);
		},
		async importData(prepared, tabs) {
			await schema();
			// What's there now goes, the tables linked to first; empty ones need no statement.
			// One row with a column per table: D1 allows only 5 terms in a UNION.
			const [found] = await all<Record<TabKey, number>>(`SELECT ${TAB_ORDER.map((tab) => `EXISTS (SELECT 1 FROM ${tableOf(tab)}) AS ${quote(tab)}`).join(', ')}`);
			const filled = new Set(TAB_ORDER.filter((tab) => found[tab]));
			const statements: D1Statement[] = [
				// Links are checked when the batch ends: a concert may name one that comes after it.
				db.prepare('PRAGMA defer_foreign_keys = ON'),
				...[...TAB_ORDER].reverse().filter((tab) => filled.has(tab)).map((tab) => db.prepare(`DELETE FROM ${tableOf(tab)}`)),
				db.prepare('DELETE FROM data_tabs')
			];
			if (tabs.length) statements.push(db.prepare(`INSERT INTO data_tabs (tab) VALUES ${tabs.map((tab) => `(${literal(tab)})`).join(', ')}`));
			for (const tab of TAB_ORDER) {
				const rows = prepared.rows[tab] ?? [];
				const columns = ['id', ...sqlColumns(tab)];
				const head = `INSERT INTO ${tableOf(tab)} (${columns.map(quote).join(', ')}) VALUES `;
				let values: string[] = [];
				let bytes = 0;
				const flush = () => {
					if (values.length) statements.push(db.prepare(head + values.join(', ')));
					values = [];
					bytes = 0;
				};
				for (const { id, row } of rows) {
					const tuple = `(${columns.map((column) => literal(column === 'id' ? id : row[column])).join(', ')})`;
					if (bytes + tuple.length > STATEMENT_BYTES) flush();
					values.push(tuple);
					bytes += tuple.length + 2;
				}
				flush();
			}
			statements.push(setState('data-source', 'd1'), bump());
			// One batch is one transaction: nobody ever sees half an import.
			await write('pieces', statements);
		}
	};
}
