import { env } from 'cloudflare:workers';
import { isAdminOnly, normalizeEmail, type AccessList } from '#lib/access/access.ts';
import { DEMO_DESK_PARTNER, DEMO_MEMBER } from './demo/data.ts';
import { features, isDemo } from './env.ts';
import { MemoryLendingStore, SqlLendingStore, type LendingStore } from './lending-store.ts';
import { today } from './members.ts';
import { perDatabase } from './polls-store.ts';
import type { D1 } from './db/sql.ts';

/**
 * The instruments the orchestra lends out (#296) live in D1, the binding "DB"; without it the
 * page says it isn't set up. The demo keeps them in memory, with a few sample instruments.
 */

export const LENDING_RIGHT = 'instrumente.verwalten';

let demo: Promise<MemoryLendingStore> | null = null;
const sql = perDatabase((db) => new SqlLendingStore(db));

export async function lendingStore(): Promise<LendingStore | null> {
	if (!features().lending) return null;
	if (isDemo()) return (demo ??= demoLending());
	const db = (env as { DB?: D1 }).DB;
	return db ? sql(db) : null;
}

/** Back to the sample instruments, with the rest of the demo. */
export function resetDemoLending() {
	demo = null;
}

/** Who an instrument can go to: members who play, by name. */
export function borrowers(list: AccessList | null): { email: string; name: string }[] {
	return (list?.members ?? [])
		.filter((member) => !isAdminOnly(member) && member.status !== 'inaktiv')
		.map((member) => ({ email: normalizeEmail(member.email), name: member.name || member.email }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** A person's own loans, open ones first; empty without a store or when reading fails. */
export async function myInstrumentLoans(email: string) {
	const store = await lendingStore();
	if (!store) return [];
	try {
		const [loans, instruments] = await Promise.all([store.loansOf(normalizeEmail(email)), store.instruments()]);
		const byId = new Map(instruments.map((instrument) => [instrument.id, instrument]));
		return loans.flatMap((loan) => {
			const instrument = byId.get(loan.instrumentId);
			return instrument ? [{ loan, instrument }] : [];
		});
	} catch (cause) {
		console.error('Reading the instrument loans failed:', cause);
		return [];
	}
}

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** A violin out with the demo member, one due back soon, one in repair, one free. */
async function demoLending(): Promise<MemoryLendingStore> {
	const store = new MemoryLendingStore();
	const day = today();
	const by = 'verwaltung@example.org';
	const violin = await store.addInstrument({ kind: 'Violine', size: '3/4', maker: 'Gliga Gems II', serial: 'BK-V-07', accessories: 'Koffer, Bogen, Kolophonium', value: '450 €, über den Verein versichert', status: 'available' });
	const cello = await store.addInstrument({ kind: 'Violoncello', size: '1/2', maker: 'Höfner AS-060', serial: 'BK-C-02', accessories: 'Hülle, Bogen, Stachelhalter', status: 'available' });
	await store.addInstrument({ kind: 'Klarinette in B', maker: 'Yamaha YCL-255', serial: 'BK-K-01', accessories: 'Koffer, Mundstück, Blattschraube', status: 'repair', notes: 'Polster der Es-Klappe undicht, beim Holzblasinstrumentenbauer.' });
	await store.addInstrument({ kind: 'Viola', size: '15"', serial: 'BK-VA-03', accessories: 'Koffer, Bogen', status: 'available' });
	await store.lend({ instrumentId: violin.id, email: DEMO_MEMBER.email, name: DEMO_MEMBER.name, from: addDays(day, -120), due: addDays(day, 200), handover: 'Neue Saiten, kleiner Kratzer an der Zarge.', by });
	await store.lend({ instrumentId: cello.id, email: DEMO_DESK_PARTNER.email, name: DEMO_DESK_PARTNER.name, from: addDays(day, -300), due: addDays(day, 9), by });
	return store;
}
