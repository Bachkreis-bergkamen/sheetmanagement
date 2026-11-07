import { env } from 'cloudflare:workers';
import { normalizeEmail, resolveAccess, type AccessList } from '#lib/access/access.ts';
import { isFor, unreadForAuthor, unreadForLeitung } from '#lib/kummer/kummer.ts';
import { authConfig } from './auth/index.ts';
import { isDemo } from './env.ts';
import { MemoryKummerStore, SqlKummerStore, type KummerStore } from './kummer-store.ts';
import type { SqlDatabase } from './polls-store.ts';
import { getAccessList } from './repertoire.ts';

/**
 * The Kummerkasten on the server: kept in D1 (binding "DB"), in memory for the demo. Without
 * D1 or sign-in it isn't there, since it needs to know who may read and who wrote.
 */

export const KUMMER_RIGHT = 'kummerkasten.lesen';

let demo: MemoryKummerStore | null = null;

export function kummerStore(): KummerStore | null {
	if (isDemo()) return (demo ??= new MemoryKummerStore());
	const db = (env as { DB?: SqlDatabase }).DB;
	return db ? new SqlKummerStore(db) : null;
}

/** Back to empty, with the rest of the demo. */
export function resetDemoKummer() {
	demo = null;
}

/**
 * The writer as the store knows them: HMAC-SHA256 of their address under SESSION_SECRET. The
 * app finds their threads again; the database alone doesn't say whose they are.
 */
export async function authorKey(email: string): Promise<string | null> {
	const auth = authConfig();
	if (auth.mode !== 'on' || !auth.sessionSecret) return null;
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', encoder.encode(auth.sessionSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`kummerkasten:${normalizeEmail(email)}`));
	return btoa(String.fromCharCode(...new Uint8Array(signature)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

export interface LeitungPerson {
	email: string;
	name: string;
	/** Their groups that hold the right ("Dirigat", "Orga"), to tell them apart in the form. */
	roles: string[];
}

/** Who reads the Kummerkasten: members (not inactive) who hold the right, by name. */
export function leitungOf(list: AccessList | null): LeitungPerson[] {
	if (!list) return [];
	const holders = new Set(list.grants.filter((grant) => grant.right === KUMMER_RIGHT).map((grant) => grant.who.trim().toLowerCase()));
	return list.members
		.filter((member) => member.status !== 'inaktiv' && resolveAccess({ email: member.email, name: member.name }, list, []).rights.has(KUMMER_RIGHT))
		.map((member) => ({ email: normalizeEmail(member.email), name: member.name, roles: member.groups.filter((group) => holders.has(group.trim().toLowerCase())) }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getLeitung(): Promise<LeitungPerson[]> {
	return leitungOf(await getAccessList().catch(() => null));
}

/** New for this person: answers to what they wrote, and, for the Leitung, messages for them. */
export async function unreadKummer(locals: App.Locals): Promise<{ answers: number; inbox: number }> {
	const store = kummerStore();
	const email = locals.access.user?.email;
	if (!store || !email || locals.auth !== 'on') return { answers: 0, inbox: 0 };
	const me = normalizeEmail(email);
	const key = await authorKey(me);
	const reader = locals.access.rights.has(KUMMER_RIGHT);
	const [mine, myReads, all, leitungReads] = await Promise.all([
		key ? store.listByAuthor(key) : [],
		key ? store.readsOf(`author:${key}`) : new Map<string, string>(),
		reader ? store.list() : [],
		reader ? store.readsOf(me) : new Map<string, string>()
	]);
	return {
		answers: mine.filter((thread) => unreadForAuthor(thread, myReads.get(thread.id))).length,
		inbox: all.filter((thread) => !thread.closedAt && isFor(thread, me) && unreadForLeitung(thread, leitungReads.get(thread.id))).length
	};
}
