import type { TabKey } from '#lib/repertoire/sheet.ts';
import { DataCheckError, DataConflictError, decode, encode, LinkIndex, namedRowsOf, SCHEMA, snake, uniqueValues, type SqlRow } from './schema.ts';
import type { DataRow, DataState, Store } from './types.ts';

/**
 * The orchestra's data without D1 (demo, tests): the same tables, links and checks as in
 * data-sql.ts, kept in memory. A change that breaks a check changes nothing.
 */

type DataMethods = Pick<Store, 'dataState' | 'setDataSource' | 'readData' | 'addDataTab' | 'appendData' | 'updateData' | 'deleteData' | 'replaceData' | 'importData'>;
type Stored = { id: number; rev: number; row: SqlRow };

export function memoryData(): DataMethods {
	let tables = new Map<TabKey, Stored[]>();
	let present = new Set<TabKey>();
	const meta: DataState = { source: 'sheet', version: 0 };
	let nextId = 1;
	const rowsOf = (tab: TabKey) => tables.get(tab) ?? [];

	function index(): LinkIndex {
		const links = new LinkIndex();
		for (const [tab, rows] of tables) for (const { id, row } of rows) links.add(tab, id, row);
		return links;
	}

	/** The tables as they'd be after a change, checked like SQLite would; then kept. */
	function commit(next: Map<TabKey, Stored[]>, tab: TabKey) {
		for (const [name, rows] of next) {
			const seen = new Set<string>();
			for (const { row } of rows) {
				for (const { set, value } of uniqueValues(name, row)) {
					const key = `${set.join(',')}\n${value}`;
					if (seen.has(key)) throw new DataCheckError('unique', name, set.join(', '), '');
					seen.add(key);
				}
			}
		}
		// Links to rows that are gone: a required one goes with it, a link within a tab is cleared, any other refuses.
		for (const [name, spec] of Object.entries(SCHEMA) as [TabKey, (typeof SCHEMA)[TabKey]][]) {
			for (const [column, link] of Object.entries(spec.links ?? {})) {
				const ids = new Set((next.get(link.tab) ?? []).map((stored) => stored.id));
				const field = `${snake(column)}_id`;
				const rows = next.get(name) ?? [];
				const broken = rows.filter(({ row }) => typeof row[field] === 'number' && !ids.has(row[field] as number));
				if (!broken.length) continue;
				if (link.required) next.set(name, rows.filter((stored) => !broken.includes(stored)));
				else if (link.tab === name) next.set(name, rows.map((stored) => (broken.includes(stored) ? { ...stored, row: { ...stored.row, [field]: null } } : stored)));
				else throw new DataCheckError('used', tab, '', '');
			}
		}
		tables = next;
		meta.version++;
	}

	const copy = () => new Map([...tables].map(([tab, rows]) => [tab, [...rows]]));

	return {
		dataState: async () => ({ ...meta }),
		async setDataSource(source) {
			meta.source = source;
			meta.version++;
		},
		async readData(tabs) {
			const byId = new Map([...tables].map(([tab, rows]) => [tab, new Map(rows.map((stored) => [stored.id, stored.row]))]));
			const target = (tab: TabKey, id: number) => byId.get(tab)?.get(id);
			const named = namedRowsOf(byId);
			return Object.fromEntries(
				[...present]
					.filter((tab) => !tabs || tabs.includes(tab))
					.map((tab) => [tab, rowsOf(tab).map(({ id, rev, row }): DataRow => ({ id, rev, cells: decode(tab, row, target, named) }))])
			);
		},
		async addDataTab(tab) {
			present.add(tab);
			meta.version++;
		},
		async appendData(tab, list) {
			if (!list.length) return;
			const links = index();
			const next = copy();
			next.set(tab, [...rowsOf(tab), ...list.map((cells) => ({ id: nextId++, rev: 0, row: encode(tab, cells, links.resolve) }))]);
			commit(next, tab);
		},
		async updateData(tab, list) {
			const links = index();
			const changes = new Map(list.map((update) => [update.id, update]));
			const current = rowsOf(tab);
			for (const update of list) {
				if (current.find((stored) => stored.id === update.id)?.rev !== update.rev) throw new DataConflictError(tab);
			}
			const next = copy();
			next.set(tab, current.map((stored) => (changes.has(stored.id) ? { id: stored.id, rev: stored.rev + 1, row: encode(tab, changes.get(stored.id)!.cells, links.resolve) } : stored)));
			commit(next, tab);
		},
		async deleteData(tab, list) {
			const current = rowsOf(tab);
			for (const gone of list) {
				if (current.find((stored) => stored.id === gone.id)?.rev !== gone.rev) throw new DataConflictError(tab);
			}
			const ids = new Set(list.map((gone) => gone.id));
			const next = copy();
			next.set(tab, current.filter((stored) => !ids.has(stored.id)));
			commit(next, tab);
		},
		async replaceData(tab, list) {
			const links = index();
			const next = copy();
			next.set(tab, list.map((cells) => ({ id: nextId++, rev: 0, row: encode(tab, cells, links.resolve) })));
			commit(next, tab);
			present.add(tab);
		},
		async importData(prepared, tabs) {
			tables = new Map(Object.entries(prepared.rows).map(([tab, rows]) => [tab as TabKey, rows!.map(({ id, row }) => ({ id, rev: 0, row }))]));
			nextId = Math.max(0, ...[...tables.values()].flat().map((stored) => stored.id)) + 1;
			present = new Set(tabs);
			meta.source = 'd1';
			meta.version++;
		}
	};
}
