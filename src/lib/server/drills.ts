import { mayFor, normalizeEmail, type Access, type AccessList, type Member } from '#lib/access/access.ts';
import { boardOf, effectiveSharing, overviewOf, shiftDay, SYNC_DAYS, weekOf, type BoardEntry, type Overview, type Sharing } from '#lib/practice/drills/sharing.ts';
import { getStore } from './db/index.ts';
import { today } from './members.ts';
import { getAccessList } from './repertoire.ts';

/**
 * The Übebereich's sharing on the server (#300): what a member chose to share, the weekly
 * board of those who share with it, and the overviews for leaders and parents. Every view reads
 * only members who share with that audience; nothing is computed over anyone else.
 */

/** Whether a member is someone's child: named in a parent's "Kinder" cell. */
export const isChild = (list: AccessList, email: string) => list.members.some((member) => member.children.includes(email));

/** The parents who name a member as their child. */
export const parentsOf = (list: AccessList, email: string) => list.members.filter((member) => member.children.includes(email)).map((member) => member.email);

export interface SharingState {
	/** What the member chose. */
	chosen: Sharing | null;
	/** What holds: for a young player, the board and the leaders only with a parent's consent. */
	effective: Sharing;
	child: boolean;
	consented: boolean;
}

export async function sharingState(list: AccessList, email: string): Promise<SharingState> {
	const store = getStore();
	const child = isChild(list, email);
	const [chosen, consent] = await Promise.all([store.drillSharing(email), child ? store.drillConsentOf(email) : null]);
	// A consent counts only while the one who gave it is still listed as a parent of the child.
	const consented = !!consent && parentsOf(list, email).includes(consent);
	return { chosen, effective: effectiveSharing(chosen, child, consented), child, consented };
}

/** Whether two members share an orchestra: one without orchestras plays in all of them. */
const together = (a: Pick<Member, 'orchestras'>, b: Pick<Member, 'orchestras'>) =>
	!a.orchestras.length || !b.orchestras.length || a.orchestras.some((orchestra) => b.orchestras.includes(orchestra));

/** Everyone whose sharing holds for an audience, with their member row. */
async function sharingWith(list: AccessList, audience: keyof Sharing): Promise<Member[]> {
	const store = getStore();
	const all = await store.drillSharingAll();
	const members: Member[] = [];
	for (const [email, chosen] of all) {
		const member = list.membersByEmail.get(email);
		if (!member || !chosen[audience]) continue;
		const child = isChild(list, email);
		const consent = child ? await store.drillConsentOf(email) : null;
		if (effectiveSharing(chosen, child, !!consent && parentsOf(list, email).includes(consent))[audience]) members.push(member);
	}
	return members;
}

export interface Board {
	week: string[];
	entries: BoardEntry[];
}

/**
 * This week's board for a member who is on it: the others on it who play in one of their
 * orchestras. Null for anyone not on it: the board is for those who take part.
 */
export async function boardFor(list: AccessList, email: string, state: SharingState): Promise<Board | null> {
	const me = list.membersByEmail.get(email);
	if (!me || !state.effective.board) return null;
	const people = (await sharingWith(list, 'board')).filter((member) => member.email === email || together(member, me));
	const week = weekOf(today());
	const rows = await getStore().drillDaysOf(people.map((member) => member.email), week[0]);
	return { week, entries: boardOf(people, rows, week, email) };
}

export interface MemberOverview {
	email: string;
	name: string;
	instrument: string;
	overview: Overview;
}

const overviewsOf = async (members: Member[]): Promise<MemberOverview[]> => {
	const now = today();
	const rows = await getStore().drillDaysOf(members.map((member) => member.email), shiftDay(now, -(SYNC_DAYS - 1)));
	return members
		.map((member) => ({ email: member.email, name: member.name, instrument: member.instrument ?? '', overview: overviewOf(rows.filter((row) => row.email === member.email), now) }))
		.sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * The leaders' overview: members who share with the leaders, in the orchestras where the viewer
 * holds "ueben.begleiten". A member without orchestras counts for every orchestra.
 */
export async function leaderOverview(access: Pick<Access, 'rights' | 'scopes'>, list: AccessList): Promise<MemberOverview[]> {
	const members = (await sharingWith(list, 'leaders')).filter((member) => mayFor(access, 'ueben.begleiten', member.orchestras.join(', ')));
	return overviewsOf(members);
}

export interface ChildDrills {
	email: string;
	name: string;
	/** Whether this parent allows the child on the board and to the leaders. */
	consented: boolean;
	/** What the child shares with whom, as it holds. */
	effective: Sharing;
	/** The child's summary, when the child shares it with their parents. */
	overview: Overview | null;
}

/** What a parent sees and decides about each child's Übebereich. */
export async function childrenDrills(list: AccessList, parent: string, children: Member[]): Promise<ChildDrills[]> {
	const store = getStore();
	return Promise.all(
		children.map(async (child) => {
			const state = await sharingState(list, child.email);
			const consent = await store.drillConsentOf(child.email);
			const overview = state.effective.parents ? (await overviewsOf([child]))[0].overview : null;
			return { email: child.email, name: child.name, consented: consent === normalizeEmail(parent), effective: state.effective, overview };
		})
	);
}

/** The access list, for the routes here; null when it can't be read. */
export const drillsAccessList = () => getAccessList().catch(() => null);
