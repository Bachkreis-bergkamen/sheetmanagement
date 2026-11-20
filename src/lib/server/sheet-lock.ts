import { AsyncLocalStorage } from 'node:async_hooks';
import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import * as t from '#lib/i18n/texts.ts';
import { appEnv, isDemo } from './env.ts';

/**
 * Runs writes to the sheet one after another (#156). Deployed, the turn comes from the
 * SheetWriteLock Durable Object, so it holds across Worker instances; in dev, the demo and
 * tests a queue in this instance does. Nested calls (a read-modify-write that wraps
 * appendRecords etc.) run in the turn they already have.
 *
 * Once D1 holds the data (#186), a plain save doesn't wait for a turn: its rows have ids, and
 * the revision it read makes a save over a newer one fail instead of overwrite it. The lock
 * stays for three things: every write while the sheet is the source (which "Zurück zur
 * Tabelle" can make it again), the import and export, which must not interleave with saves to
 * the sheet, and the read-modify-writes that wrap their saves in it (sign-ups, attendance, a +1
 * on a wish, a report's status, a shared programme), so two people at once get both their
 * changes instead of one "changed meanwhile". Those can go once each is a single statement
 * (an upsert, votes = votes + 1); then, with the sheet no longer a source, so can the lock.
 */

/** Longest a turn may last; a Worker that dies holding it frees it after this. */
const LEASE_MS = 20_000;
/** Longest a save waits for its turn before giving up with "busy". */
const WAIT_MS = 15_000;

interface LockStub {
	acquire(leaseMs: number, waitMs: number): Promise<string | undefined>;
	release(ticket: string): Promise<void>;
}

export interface LockNamespace {
	idFromName(name: string): unknown;
	get(id: unknown): LockStub;
}

const inTurn = new AsyncLocalStorage<true>();
let tail: Promise<unknown> = Promise.resolve();

export function withSheetLock<T>(fn: () => Promise<T>): Promise<T> {
	if (inTurn.getStore()) return fn();
	// The dev proxy can't reach a Durable Object that only the built worker exports.
	const namespace = dev || isDemo() ? undefined : appEnv().SHEET_LOCK;
	return namespace ? withDurableLock(namespace, fn) : withLocalLock(fn);
}

function withLocalLock<T>(fn: () => Promise<T>): Promise<T> {
	const run = tail.then(() => inTurn.run(true, fn));
	tail = run.catch(() => undefined);
	return run;
}

async function withDurableLock<T>(namespace: LockNamespace, fn: () => Promise<T>): Promise<T> {
	const lock = namespace.get(namespace.idFromName('sheet'));
	const ticket = await lock.acquire(LEASE_MS, WAIT_MS);
	if (!ticket) error(503, t.common.sheetBusy);
	try {
		return await inTurn.run(true, fn);
	} finally {
		await lock.release(ticket).catch((cause: unknown) => console.error('Releasing the sheet lock failed:', cause));
	}
}
