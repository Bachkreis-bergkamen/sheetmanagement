import { normalizeEmail, type Member } from '#lib/access/access.ts';

/**
 * Photos and videos of members (#299): whether someone may appear in the orchestra's photos and
 * videos (website, programme, social media). A young player's parent answers for them, everyone
 * else for themself; nobody having answered counts as "no".
 */

export interface PhotoConsent {
	allowed: boolean;
	/** Who answered: the member, or a parent for a young player. */
	by: string;
	/** "2026-11-23 08:30:00" (UTC). */
	at: string;
}

export type PhotoAnswer = 'yes' | 'no' | 'open';

export const answerOf = (consent: Pick<PhotoConsent, 'allowed'> | null | undefined): PhotoAnswer => (consent ? (consent.allowed ? 'yes' : 'no') : 'open');

/** The parent accounts that name this member as their child. */
export const parentsOf = (child: string, members: Pick<Member, 'email' | 'children'>[]) =>
	members.filter((member) => member.children.includes(normalizeEmail(child))).map((member) => member.email);

/**
 * Whether `who` may answer for `member`: their parents when they have any linked, else the member
 * themself. A child with a parent account can't take back what the parent said, nor the reverse.
 */
export function mayAnswer(who: string, member: string, members: Pick<Member, 'email' | 'children'>[]): boolean {
	const parents = parentsOf(member, members);
	return parents.length ? parents.includes(normalizeEmail(who)) : normalizeEmail(who) === normalizeEmail(member);
}

/** Players sorted for the Leitung: no first (they must not be shown), then not answered, then yes. */
export function byAnswer<T extends { name: string; answer: PhotoAnswer }>(players: T[]): T[] {
	const order: Record<PhotoAnswer, number> = { no: 0, open: 1, yes: 2 };
	return [...players].sort((a, b) => order[a.answer] - order[b.answer] || a.name.localeCompare(b.name));
}
