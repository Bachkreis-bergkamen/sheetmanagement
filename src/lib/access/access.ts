import { LAYOUT, normalize, readTable, type Problem, type Table, type ColumnKey } from '#lib/repertoire/sheet.ts';

/** Deliberately few. Every member can view; the rest are granted in the "Rechte" tab. */
export const RIGHTS = [
	'ansehen',
	'programme.bearbeiten',
	'stuecke.bearbeiten',
	'archiv.bearbeiten',
	'anmeldungen.sehen',
	'anwesenheit.erfassen',
	'termine.planen',
	// Concert tickets (docs/tickets-plan.md), only while the "tickets" feature is on.
	'karten.verwalten',
	'karten.einlass',
	// The Kummerkasten: anonymous messages to the Leitung, answered privately.
	'kummerkasten.lesen',
	'mitglieder.verwalten'
] as const;
export type Right = (typeof RIGHTS)[number];

export const ACCESS_TABS = ['members', 'groups', 'rights', 'requests'] as const;
export type AccessTab = (typeof ACCESS_TABS)[number];
export type AccessValues = Partial<Record<AccessTab, string[][]>>;

/**
 * Paused or inactive members keep their access, but don't count for coverage. "verwaltung" is an
 * account that only administers (the orchestra's shared admin login): it never plays, so it is
 * left out of sign-ups, attendance and polls altogether.
 */
export const MEMBER_STATUSES = ['aktiv', 'pausiert', 'inaktiv', 'verwaltung'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export interface Member {
	row: number;
	email: string;
	name: string;
	/** As entered, e.g. "Geige I & II, Viola"; read with parseInstruments. */
	instrument?: string;
	/** The names of their roles ("Gruppen"), as in `roles`. */
	groups: string[];
	/**
	 * Their roles, each maybe for some orchestras only: "Dirigat (A, B)" in the Gruppen column
	 * makes this person the Dirigat of A and B, not of the others. No orchestras: all of them.
	 */
	roles: Role[];
	/** Short orchestra names ("EO", "A"). Empty: not set, so the member counts for every orchestra. */
	orchestras: string[];
	status: MemberStatus;
	/** "2027-03-31": paused up to and including this day. */
	pausedUntil?: string;
	/** Personal access link: 0 none, n > 0 link n is valid, -n link n was revoked (see server/auth/links.ts). */
	linkVersion: number;
	/** Personal calendar feed, counted the same way (see server/auth/feed.ts). */
	feedVersion: number;
}

/** A role one member holds, maybe only for some orchestras (#305). */
export interface Role {
	name: string;
	/** Short orchestra names its rights hold for, for this person. Empty: all of them. */
	orchestras: string[];
}

export interface Group {
	row: number;
	name: string;
	description?: string;
}

export interface Grant {
	row: number;
	/** An email address or a group name, as entered. */
	who: string;
	right: Right;
}

export interface AccessRequest {
	row: number;
	email: string;
	name: string;
	requestedAt: string;
}

export interface AccessList {
	/** Whether the "Mitglieder" tab exists; without it only bootstrap admins get in. */
	present: boolean;
	members: Member[];
	membersByEmail: Map<string, Member>;
	groups: Group[];
	grants: Grant[];
	requests: AccessRequest[];
	tables: { [K in AccessTab]?: Table<ColumnKey<K> & string> };
	problems: Problem[];
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** "Geigen, Vorstand" → ["Geigen", "Vorstand"] */
export const splitGroups = (text: string) =>
	text
		.split(/[,;]/)
		.map((group) => group.trim())
		.filter(Boolean);

/**
 * A member's Gruppen cell: "Dirigat (A, B), Vorstand" → Dirigat for A and B, Vorstand for all.
 * Commas inside the brackets name orchestras, outside them they separate roles.
 */
export function parseRoles(text: string): Role[] {
	const roles: Role[] = [];
	for (const match of (text ?? '').matchAll(/([^,;(]+)(?:\(([^)]*)\))?/g)) {
		const name = match[1].trim();
		if (!name) continue;
		const orchestras = splitGroups(match[2] ?? '');
		const known = roles.find((role) => normalize(role.name) === normalize(name));
		// The same role twice: for all once either says so, else for both lists.
		if (known) known.orchestras = known.orchestras.length && orchestras.length ? [...new Set([...known.orchestras, ...orchestras])] : [];
		else roles.push({ name, orchestras });
	}
	return roles;
}

/** The other way round, for the sheet: [Dirigat (A, B), Vorstand] → "Dirigat (A, B), Vorstand". */
export const formatRoles = (roles: Role[]) =>
	roles.map((role) => (role.orchestras.length ? `${role.name} (${role.orchestras.join(', ')})` : role.name)).join(', ');

export function buildAccessList(values: AccessValues): AccessList {
	const problems: Problem[] = [];
	const read = <K extends AccessTab>(key: K) =>
		values[key] ? readTable(values[key], LAYOUT[key].columns as Record<ColumnKey<K> & string, string>) : undefined;
	const tables = { members: read('members'), groups: read('groups'), rights: read('rights'), requests: read('requests') };

	const members: Member[] = [];
	const membersByEmail = new Map<string, Member>();
	for (const { row, values: v } of tables.members?.rows ?? []) {
		const email = normalizeEmail(v.email);
		if (!email) continue;
		if (membersByEmail.has(email)) {
			problems.push({ kind: 'duplicate-member', tab: LAYOUT.members.tab, row, value: v.email });
			continue;
		}
		const member: Member = {
			row,
			email,
			name: v.name || email,
			instrument: v.instrument || undefined,
			groups: [],
			roles: parseRoles(v.groups),
			orchestras: splitGroups(v.orchestras),
			status: parseStatus(v.status),
			pausedUntil: parseDay(v.pausedUntil),
			linkVersion: parseLinkVersion(v.linkVersion),
			feedVersion: parseLinkVersion(v.feedVersion)
		};
		member.groups = member.roles.map((role) => role.name);
		members.push(member);
		membersByEmail.set(email, member);
	}

	const groups = (tables.groups?.rows ?? [])
		.filter(({ values: v }) => v.name)
		.map(({ row, values: v }) => ({ row, name: v.name, description: v.description || undefined }));

	const grants: Grant[] = [];
	for (const { row, values: v } of tables.rights?.rows ?? []) {
		if (!v.who && !v.right) continue;
		const right = RIGHTS.find((r) => r === v.right.trim().toLowerCase());
		if (!right) {
			problems.push({ kind: 'unknown-right', tab: LAYOUT.rights.tab, row, value: v.right });
			continue;
		}
		if (v.who) grants.push({ row, who: v.who, right });
	}

	const requests = (tables.requests?.rows ?? [])
		.filter(({ values: v }) => v.email)
		.map(({ row, values: v }) => ({ row, email: normalizeEmail(v.email), name: v.name, requestedAt: v.requestedAt }));

	return { present: !!tables.members, members, membersByEmail, groups, grants, requests, tables, problems };
}

export interface User {
	email: string;
	name: string;
}

export interface Access {
	user: User | null;
	/** Listed in "Mitglieder", or a bootstrap admin. */
	member: boolean;
	/** From BOOTSTRAP_ADMINS: every right, whatever the sheet says. */
	bootstrapAdmin: boolean;
	/** Signed in with a personal access link, so maybe without a Google account. */
	viaLink?: boolean;
	/** The member list couldn't be read just now (Google slow or down), so membership is unknown. */
	unavailable?: boolean;
	rights: Set<Right>;
	/**
	 * Rights held only for some orchestras (#305), through a role this person holds only for them; a right not
	 * in here holds for all. See mayFor.
	 */
	scopes?: Map<Right, string[]>;
	/** On one date's pages, where `rights` holds only what holds there: all rights, for the menu. */
	everywhere?: Set<Right>;
}

/** What a signed-in person may do: bootstrap admins everything, members "ansehen" plus their grants. */
export function resolveAccess(user: User | null, list: AccessList | null, bootstrapAdmins: string[]): Access {
	if (!user) return { user, member: false, bootstrapAdmin: false, rights: new Set() };
	const email = normalizeEmail(user.email);
	if (bootstrapAdmins.map(normalizeEmail).includes(email)) {
		return { user, member: true, bootstrapAdmin: true, rights: new Set(RIGHTS) };
	}
	const member = list?.membersByEmail.get(email);
	if (!member) return { user, member: false, bootstrapAdmin: false, rights: new Set() };

	const whos = new Set([email, ...member.groups.map(normalize)]);
	const rights = new Set<Right>(['ansehen']);
	// Per right: the orchestras it holds for, or null once one grant holds for all (#305).
	const reach = new Map<Right, string[] | null>();
	for (const grant of list!.grants) {
		const byEmail = grant.who.includes('@');
		const who = byEmail ? normalizeEmail(grant.who) : normalize(grant.who);
		if (!whos.has(who)) continue;
		rights.add(grant.right);
		// A role held only for some orchestras (#305): as the member's own Gruppen cell says.
		const limited = byEmail ? [] : (member.roles.find((role) => normalize(role.name) === who)?.orchestras ?? []);
		const before = reach.get(grant.right);
		if (!limited.length || before === null) reach.set(grant.right, null);
		else reach.set(grant.right, [...(before ?? []), ...limited]);
	}
	const scopes = new Map([...reach].filter((entry): entry is [Right, string[]] => entry[1] !== null));
	return { user, member: true, bootstrapAdmin: false, rights, ...(scopes.size ? { scopes } : {}) };
}

/**
 * Whether a right holds for something of an orchestra, or of several ("EO, A"): a right limited
 * to some orchestras (#305) holds where one of them plays. Something of no orchestra in
 * particular (a date for everyone) is open to every holder of the right.
 */
export function mayFor(access: Pick<Access, 'rights' | 'scopes'>, right: Right, orchestra: string | undefined): boolean {
	if (!access.rights.has(right)) return false;
	const scope = access.scopes?.get(right);
	if (!scope) return true;
	const wanted = splitGroups(orchestra ?? '');
	return !wanted.length || wanted.some((name) => scope.some((own) => normalize(own) === normalize(name)));
}

/** The access for one date or concert (#305): the rights that hold for its orchestra(s). */
export function accessFor<A extends Pick<Access, 'rights' | 'scopes' | 'everywhere'>>(access: A, orchestra: string | undefined): A {
	if (!access.scopes?.size) return access;
	return { ...access, rights: new Set([...access.rights].filter((right) => mayFor(access, right, orchestra))), everywhere: access.rights };
}

/** "a@x.org, b@y.org" → ["a@x.org", "b@y.org"] */
export function parseEmailList(text: string | undefined): string[] {
	return (text ?? '')
		.split(/[,;\s]+/)
		.map(normalizeEmail)
		.filter((email) => email.includes('@'));
}

/**
 * Approving access requests: who becomes a member (each email once, skipping existing
 * members) and which request rows go. Only the emails the admin saw are touched, so a
 * request that arrives meanwhile stays open.
 */
export function planApproval(
	memberEmails: string[],
	requests: { row: number; email: string; name: string }[],
	emails: string[]
): { add: { email: string; name: string }[]; remove: number[] } {
	const wanted = new Set(emails.map(normalizeEmail));
	const known = new Set(memberEmails.map(normalizeEmail));
	const add: { email: string; name: string }[] = [];
	const remove: number[] = [];
	for (const request of requests) {
		const email = normalizeEmail(request.email);
		if (!wanted.has(email)) continue;
		remove.push(request.row);
		if (known.has(email)) continue;
		known.add(email);
		add.push({ email, name: request.name });
	}
	return { add, remove };
}

/** "anna.mueller@gmail.com" → "an…@gmail.com": enough to tell people apart, without showing the address. */
export function maskEmail(email: string): string {
	const at = email.indexOf('@');
	if (at < 0) return email;
	const local = email.slice(0, at);
	return `${local.slice(0, local.length > 3 ? 2 : 1)}…${email.slice(at)}`;
}

/** A name without a second word ("Anna") can't be told apart from another Anna. */
export const lacksSurname = (name: string) => !/\S\s+\S/.test(name.trim()) && !name.includes('@');

/** "3", "-3", "" → 3, -3, 0. */
export function parseLinkVersion(text: string): number {
	const n = Number.parseInt(text.trim(), 10);
	return Number.isFinite(n) ? n : 0;
}

/** Empty or unknown counts as active, so a member is never left out by a typo. */
export function parseStatus(text: string): MemberStatus {
	const value = normalize(text);
	if (value.startsWith('admin') || value.includes('verwalt')) return 'verwaltung';
	return MEMBER_STATUSES.find((status) => value.startsWith(status.slice(0, 4))) ?? 'aktiv';
}

/** "2027-03-31" or "31.3.2027" → "2027-03-31"; anything else is no date. */
export function parseDay(text: string): string | undefined {
	const value = text.trim();
	const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
	const german = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
	const [year, month, day] = iso ? [iso[1], iso[2], iso[3]].map(Number) : german ? [german[3], german[2], german[1]].map(Number) : [];
	if (!year) return undefined;
	const date = new Date(Date.UTC(year, month - 1, day));
	if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
	return date.toISOString().slice(0, 10);
}

/** A pause with an end date is over the day after it; that needs no write to the sheet. */
export function currentStatus(member: Pick<Member, 'status' | 'pausedUntil'>, today: string): MemberStatus {
	return member.status === 'pausiert' && member.pausedUntil && member.pausedUntil < today ? 'aktiv' : member.status;
}

/**
 * Whether a member plays in the orchestra, or in one of several ("EO, A" for a concert they
 * play together); members without orchestras count for all of them.
 */
export function playsIn(member: Pick<Member, 'orchestras'>, orchestra: string | undefined): boolean {
	const wanted = splitGroups(orchestra ?? '');
	return !wanted.length || !member.orchestras.length || member.orchestras.some((name) => wanted.some((other) => normalize(name) === normalize(other)));
}

/**
 * Whether a date shows on a member's pages: a rehearsal only when they play in its orchestra
 * (undefined is everyone's), concerts and other dates always. Without a member, everything.
 */
export function seesDate(member: Pick<Member, 'orchestras'> | undefined, event: { type: string }, orchestra: string | undefined): boolean {
	return !member || (event.type !== 'probe' && event.type !== 'generalprobe') || playsIn(member, orchestra);
}

/** An admin-only account: never a player, whatever else its row says. */
export const isAdminOnly = (member: Pick<Member, 'status'> | undefined) => member?.status === 'verwaltung';

/** Members who count for a concert's instrumentation: active ones in its orchestra. */
export function countingMembers<M extends Pick<Member, 'orchestras' | 'status' | 'pausedUntil'>>(
	members: M[],
	orchestra: string | undefined,
	today: string
): M[] {
	return members.filter((member) => currentStatus(member, today) === 'aktiv' && playsIn(member, orchestra));
}

/** A role is a group ("Gruppen") with rights ("Rechte"); members get roles through their groups. */
export interface RolePreset {
	name: string;
	description: string;
	rights: Right[];
}

/** The rights each group holds, by group name as written in "Gruppen" (case-insensitive match). */
export function roleRights(list: Pick<AccessList, 'groups' | 'grants'>): Map<string, Right[]> {
	const byKey = new Map<string, Right[]>();
	for (const grant of list.grants) {
		if (grant.who.includes('@')) continue;
		const key = normalize(grant.who);
		byKey.set(key, [...(byKey.get(key) ?? []), grant.right]);
	}
	return new Map(list.groups.map((group) => [group.name, RIGHTS.filter((right) => byKey.get(normalize(group.name))?.includes(right))]));
}

/**
 * Setting a role's rights: which rights to add and which "Rechte" rows go. Rows for the
 * role written in another case count as the role's; duplicates of a kept right go too.
 */
export function planRoleRights(
	rows: { row: number; who: string; right: string }[],
	role: string,
	wanted: Right[]
): { add: Right[]; remove: number[] } {
	const kept = new Set<string>();
	const remove: number[] = [];
	for (const row of rows) {
		if (row.who.includes('@') || normalize(row.who) !== normalize(role)) continue;
		const right = row.right.trim().toLowerCase();
		if (wanted.includes(right as Right) && !kept.has(right)) kept.add(right);
		else remove.push(row.row);
	}
	return { add: wanted.filter((right) => !kept.has(right)), remove };
}

/** Preset roles not yet in "Gruppen", and the rights rows they bring. */
export function missingRoles(presets: RolePreset[], groups: Pick<Group, 'name'>[]): RolePreset[] {
	const known = new Set(groups.map((group) => normalize(group.name)));
	return presets.filter((preset) => !known.has(normalize(preset.name)));
}
