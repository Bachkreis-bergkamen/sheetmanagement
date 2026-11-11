import { emptyData, readData, type DrillData } from './progress.ts';

/**
 * The Übebereich's progress in this browser's IndexedDB (#300), one record per account, so a
 * shared device keeps each member's own. Nothing goes to the server. Where IndexedDB isn't
 * there (a private window in some browsers), the drills still work for the visit, unsaved.
 */

const DB = 'uebebereich';
const STORE = 'progress';
const keyOf = (account: string) => account.toLowerCase();

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	return open().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				const transaction = db.transaction(STORE, mode);
				const request = work(transaction.objectStore(STORE));
				transaction.oncomplete = () => {
					db.close();
					resolve(request.result);
				};
				transaction.onerror = transaction.onabort = () => {
					db.close();
					reject(transaction.error);
				};
			})
	);
}

/** The account's progress; empty, and `saved: false`, when it can't be kept on this device. */
export async function loadDrills(account: string): Promise<{ data: DrillData; saved: boolean }> {
	try {
		return { data: readData(await run('readonly', (store) => store.get(keyOf(account)))), saved: true };
	} catch {
		return { data: emptyData(), saved: false };
	}
}

export async function saveDrills(account: string, data: DrillData): Promise<boolean> {
	try {
		await run('readwrite', (store) => store.put(plainCopy(data), keyOf(account)));
		return true;
	} catch {
		return false;
	}
}

/** Forget the account's progress on this device. */
export async function clearDrills(account: string): Promise<void> {
	await run('readwrite', (store) => store.delete(keyOf(account))).catch(() => {});
}

/** A plain copy, as IndexedDB can't store Svelte's reactive proxies. */
function plainCopy<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}
