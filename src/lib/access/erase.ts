import { normalizeEmail } from '#lib/access/access.ts';
import { parseVotes, submitterEmail } from '#lib/feedback/feedback.ts';
import { normalize, type Table, type TabKey } from '#lib/repertoire/sheet.ts';

/**
 * "Mitglied löschen" (#158): a member's request to be deleted (Art. 17 GDPR), answered in
 * every tab at once. What is only about them goes (their row in "Mitglieder", requests,
 * rights given to their address). Where a row also counts for others, the person is
 * replaced by a pseudonym: sign-ups and attendance keep counting for the season report
 * and the Chronik, a wish keeps its +1, a note keeps its text, nobody can tell whose.
 */

export type Who = { email: string; name: string };

/** A tab's rows to delete, and rows whose cells are overwritten. */
export interface TabErase {
	key: TabKey;
	remove: number[];
	anonymise: { row: number; values: Record<string, string> }[];
}

/**
 * Stands in for the member in rows that stay: one per erased member, so a rehearsal still
 * counts them once. ".invalid" can never be a real address, so nothing is ever sent to it.
 */
export const pseudonym = (id: string) => `geloescht-${id}@geloescht.invalid`;

/** Whether an address is such a pseudonym, e.g. so retention leaves it alone. */
export const isPseudonym = (email: string) => email.trim().toLowerCase().endsWith('@geloescht.invalid');

type Plan = (values: Record<string, string>, who: Who, stand: string, anonymous: string) => 'remove' | Record<string, string> | undefined;

const mine = (value: string | undefined, who: Who) => normalizeEmail(value ?? '') === who.email;
const named = (value: string | undefined, who: Who) => !!who.name && normalize(value ?? '') === normalize(who.name);

const PLANS: Partial<Record<TabKey, Plan>> = {
	members: (v, who) => (mine(v.email, who) ? 'remove' : undefined),
	requests: (v, who) => (mine(v.email, who) ? 'remove' : undefined),
	rights: (v, who) => (mine(v.who, who) ? 'remove' : undefined),
	// The answer and the instrument stay, so the counts per section do; the comment was theirs.
	signups: (v, who, stand, anonymous) => (mine(v.who, who) ? { who: stand, name: anonymous, comment: '' } : undefined),
	attendance: (v, who, stand, anonymous) => (mine(v.who, who) ? { who: stand, name: anonymous } : undefined),
	reports: (v, who) => (submitterEmail(v.reportedBy ?? '') === who.email ? { reportedBy: '' } : undefined),
	wishes: (v, who, stand) => {
		const votes = parseVotes(v.votes ?? '');
		const own = submitterEmail(v.submittedBy ?? '') === who.email;
		if (!own && !votes.includes(who.email)) return undefined;
		return {
			...(own ? { submittedBy: '' } : {}),
			...(votes.includes(who.email) ? { votes: votes.map((vote) => (vote === who.email ? stand : vote)).join(', ') } : {})
		};
	},
	pieceNotes: (v, who) => (named(v.by, who) ? { by: '' } : undefined),
	// A scan job given to them goes back to nobody; the gap stays.
	missingParts: (v, who) => (mine(v.assignee, who) ? { assignee: '' } : undefined),
	// An assignment for the member is only about them; one they made keeps its part, without their name.
	partAssignments: (v, who) => (mine(v.who, who) ? 'remove' : named(v.by, who) ? { by: '' } : undefined),
	rehearsalNotes: (v, who) => (named(v.by, who) ? { by: '' } : undefined)
};

/** The tabs a deletion touches, in the order they're changed: the member's own row last, so a failure leaves them findable. */
export const ERASE_TABS = Object.keys(PLANS).reverse() as TabKey[];

export function planErase(
	who: Who,
	tables: Partial<Record<TabKey, Table<string>>>,
	{ id, anonymous }: { id: string; anonymous: string }
): TabErase[] {
	const me = { email: normalizeEmail(who.email), name: who.name.trim() };
	const stand = pseudonym(id);
	return ERASE_TABS.flatMap((key) => {
		const table = tables[key];
		const plan = PLANS[key];
		if (!table || !plan) return [];
		const change: TabErase = { key, remove: [], anonymise: [] };
		for (const row of table.rows) {
			const result = plan(row.values, me, stand, anonymous);
			if (result === 'remove') change.remove.push(row.row);
			else if (result) change.anonymise.push({ row: row.row, values: result });
		}
		return change.remove.length || change.anonymise.length ? [change] : [];
	});
}
