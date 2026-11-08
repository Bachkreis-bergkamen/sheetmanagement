import { getStore } from '../db/index.ts';
import { randomToken } from './session.ts';

/**
 * Invitation links: an admin makes one in /admin and sends it themselves; whoever opens it
 * picks their own name, email, password and instruments and is a member from then on. Each
 * link works once and for INVITE_DAYS. Kept in the store's state (one small list), not in
 * the sheet, so nobody with the sheet open sees a link that still works.
 */

export const INVITE_DAYS = 14;
const KEY = 'invites';

export interface Invite {
	/** The random part of the link; also its id. */
	id: string;
	/** Who it's meant for, so the admin recognises it in the list ("Anna, Bratsche"). */
	label: string;
	/** Roles the new member gets, comma-separated as in "Mitglieder". */
	groups: string;
	/** Admin who made it. */
	by: string;
	/** ISO times. */
	createdAt: string;
	expiresAt: string;
}

const isInvite = (value: unknown): value is Invite =>
	!!value && typeof value === 'object' && typeof (value as Invite).id === 'string' && typeof (value as Invite).expiresAt === 'string';

async function read(): Promise<Invite[]> {
	const raw = await getStore().getState(KEY);
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter(isInvite) : [];
	} catch {
		return [];
	}
}

const write = (invites: Invite[]) => getStore().setState(KEY, JSON.stringify(invites));

const open = (invite: Invite, now: number) => Date.parse(invite.expiresAt) > now;

/** The links that still work, newest first; expired ones are dropped here. */
export async function openInvites(now = Date.now()): Promise<Invite[]> {
	return (await read()).filter((invite) => open(invite, now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createInvite(input: { label: string; groups: string; by: string }, now = Date.now()): Promise<Invite> {
	const invite: Invite = {
		id: randomToken(18),
		label: input.label,
		groups: input.groups,
		by: input.by,
		createdAt: new Date(now).toISOString(),
		expiresAt: new Date(now + INVITE_DAYS * 86_400_000).toISOString()
	};
	await write([...(await read()).filter((other) => open(other, now)), invite]);
	return invite;
}

/** The link's invitation while it still works, else null. */
export async function findInvite(id: string, now = Date.now()): Promise<Invite | null> {
	if (!id || id.length > 64) return null;
	return (await read()).find((invite) => invite.id === id && open(invite, now)) ?? null;
}

/** Ends a link: after it was used, or when the admin takes it back. */
export async function removeInvite(id: string, now = Date.now()): Promise<void> {
	await write((await read()).filter((invite) => invite.id !== id && open(invite, now)));
}

export const inviteUrl = (origin: string, id: string) => `${origin}/auth/einladung/${id}`;
