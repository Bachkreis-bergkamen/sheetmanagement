import { fail } from '@sveltejs/kit';
import {
	currentStatus,
	formatRoles,
	missingRoles,
	normalizeEmail,
	parseLinkVersion,
	planApproval,
	planRoleRights,
	resolveAccess,
	RIGHTS,
	roleRights,
	parseRoles,
	splitGroups,
	type Right,
	type Role
} from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { normalize } from '#lib/repertoire/sheet.ts';
import { authConfig, requireRight } from '#lib/server/auth/index.ts';
import { eraseMember, previewErase } from '#lib/server/erase.ts';
import { config } from '#lib/config/index.ts';
import { splitNames } from '#lib/music/instrument-groups.ts';
import { commonInstruments, parseInstruments, playableInstruments } from '#lib/music/my-parts.ts';
import { readMemberForm, today, writable } from '#lib/server/members.ts';
import { linkToken, nextLinkVersion, revokedLinkVersion } from '#lib/server/auth/links.ts';
import { createInvite, INVITE_DAYS, inviteUrl, openInvites, removeInvite } from '#lib/server/auth/invites.ts';
import { getAccessList, getInstrumentGroups } from '#lib/server/repertoire.ts';
import { appendRecords, deleteRows, ensureColumns, readTab, refreshAfterWrite, SheetLayoutError, updateRecord } from '#lib/server/sheet-writes.ts';
import { requireSetting } from '#lib/server/services.ts';
import { getStore } from '#lib/server/db/index.ts';
import type { Actions, PageServerLoad } from './$types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.auth === 'off') return { state: 'off' as const };
	requireRight(locals, 'mitglieder.verwalten');

	const [list, groups] = await Promise.all([getAccessList(), getInstrumentGroups()]);
	const day = today();
	const auth = authConfig();
	let sheetUrl: string | undefined;
	try {
		sheetUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(requireSetting('REPERTOIRE_SHEET_ID'))}/edit`;
	} catch {
		// Not configured: no link.
	}
	const ready = !!(list?.tables.members && list.tables.rights && list.tables.requests);
	return {
		invites: await invites(auth, url.origin),
		inviteDays: INVITE_DAYS,
		state: ready ? ('ready' as const) : ('not-set-up' as const),
		sheetUrl,
		bootstrapAdmins: auth.mode === 'on' ? auth.bootstrapAdmins : [],
		requests: list?.requests.map(({ email, name, requestedAt }) => ({ email, name, requestedAt })) ?? [],
		members:
			list?.members.map(({ email, name, instrument, groups, roles, orchestras, status, pausedUntil, linkVersion }) => {
				return {
					email,
					name,
					instrument,
					// For the edit form: the instruments as picked from the list.
					choices: parseInstruments(instrument ?? '', config),
					groups,
					// Each role with the orchestras this person holds it for (#305); none: all.
					roles,
					orchestras,
					status,
					pausedUntil,
					// A pause whose date has passed already counts as active.
					current: currentStatus({ status, pausedUntil }, day),
					// Personal access link: "active", "revoked" or none.
					link: linkVersion > 0 ? ('active' as const) : linkVersion < 0 ? ('revoked' as const) : null,
					// What they may do, from their own grants and their groups'.
					rights: [...resolveAccess({ email, name }, list, auth.mode === 'on' ? auth.bootstrapAdmins : []).rights].filter(
						(right) => right !== 'ansehen'
					)
				};
			}) ?? [],
		groups: list?.groups.map(({ name, description }) => ({ name, description })) ?? [],
		// Roles: the groups with their rights and how many members have them.
		roles: list
			? [...roleRights(list)].map(([name, rights]) => ({
					name,
					description: list.groups.find((group) => group.name === name)?.description,
					rights,
					members: list.members.filter((member) => member.groups.some((g) => normalize(g) === normalize(name))).length
				}))
			: [],
		missingRoles: missingRoles(config.roles ?? [], list?.groups ?? []).map(({ name }) => name),
		// Rights given to one person, or to a group name that isn't in "Gruppen".
		grants:
			list?.grants
				.filter(({ who }) => who.includes('@') || !list.groups.some((group) => normalize(group.name) === normalize(who)))
				.map(({ who, right }) => ({ who, right })) ?? [],
		rights: RIGHTS.map((right) => ({ right, label: t.rights[right] })),
		// The sheet's groups, or the preset's while the tab is empty.
		instrumentGroups: groups
			? { own: true, unknown: groups.unknown, rows: groups.groups.map(({ row, part, players, mutual, note }) => ({ row, part, players, mutual, note })) }
			: {
					own: false,
					unknown: [],
					rows: Object.entries(config.sharedParts ?? {}).map(([part, players]) => ({ row: 0, part, players, mutual: false, note: '' }))
				},
		instruments: config.instruments.filter((instrument) => !instrument.voice).map((instrument) => instrument.name),
		playable: playableInstruments(config),
		common: commonInstruments(config),
		orchestras: config.orchestras
	};
};

/**
 * Open invitation links, with their address: an admin may copy one again. Null while sign-in
 * is off or the store (D1) isn't there, since joining needs a password account.
 */
async function invites(auth: ReturnType<typeof authConfig>, origin: string) {
	if (auth.mode !== 'on') return null;
	try {
		await getStore().accountOf('');
		return (await openInvites()).map(({ id, label, groups, expiresAt }) => ({ id, label, groups, expiresAt, url: inviteUrl(origin, id) }));
	} catch {
		return null;
	}
}

/** Runs one change; layout problems in the sheet become a message instead of a crash. */
async function change(locals: App.Locals, work: () => Promise<string | void>) {
	requireRight(locals, 'mitglieder.verwalten');
	try {
		const problem = await work();
		if (problem) return fail(400, { message: problem });
		await refreshAfterWrite();
		return { saved: true };
	} catch (error) {
		if (error instanceof SheetLayoutError) {
			return fail(409, { message: `${error.message} ${t.messages.runSetup(t.status.setupSheet)}` });
		}
		console.error('Changing members or rights failed:', error);
		return fail(503, { message: t.messages.sheetFailed });
	}
}

const field = (data: FormData, name: string) => String(data.get(name) ?? '').trim().slice(0, 200);

/** Rights apply to an email address or a group name. */
const whoKey = (who: string) => (who.includes('@') ? normalizeEmail(who) : normalize(who));
/**
 * The roles ticked on a member, each with the orchestras ticked for it (#305): "group" names the
 * role, "orchestra:<role>" its orchestras, in the configured order. None ticked: all orchestras.
 */
function rolesFromForm(data: FormData): Role[] {
	const names = [...new Set(data.getAll('group').map((value) => String(value).replace(/[(),;]/g, '').trim().slice(0, 100)).filter(Boolean))];
	return names.map((name) => {
		const ticked = new Set(data.getAll(`orchestra:${name}`).map(String));
		const orchestras = config.orchestras.filter((orchestra) => ticked.has(orchestra));
		// Every orchestra ticked is the same as none: the role holds for all of them.
		return { name, orchestras: orchestras.length === config.orchestras.length ? [] : orchestras };
	});
}


/** One request ("email") or all shown at once (several "email" fields). */
const emails = (data: FormData) => data.getAll('email').map((value) => normalizeEmail(String(value).slice(0, 200))).filter(Boolean);

async function approve(list: string[]) {
	const [members, requests] = await Promise.all([readTab('members'), readTab('requests')]);
	const plan = planApproval(
		members.rows.map((row) => row.values.email),
		requests.rows.map((row) => ({ row: row.row, email: row.values.email, name: row.values.name })),
		list
	);
	if (!plan.remove.length) return t.admin.requestGone;
	if (plan.add.length) await appendRecords('members', members, plan.add);
	await deleteRows('requests', requests, plan.remove);
}

async function decline(list: string[]) {
	const wanted = new Set(list);
	const requests = await readTab('requests');
	await deleteRows(
		'requests',
		requests,
		requests.rows.filter((row) => wanted.has(normalizeEmail(row.values.email))).map((row) => row.row)
	);
}

export const actions: Actions = {
	approve: ({ request, locals }) => change(locals, async () => approve(emails(await request.formData()))),
	decline: ({ request, locals }) => change(locals, async () => decline(emails(await request.formData()))),

	addMember: ({ request, locals }) =>
		change(locals, async () => {
			const data = await request.formData();
			const email = normalizeEmail(field(data, 'email'));
			if (!EMAIL.test(email)) return t.admin.invalidEmail;
			const members = await readTab('members');
			if (members.rows.some((row) => normalizeEmail(row.values.email) === email)) return t.admin.exists;
			await appendRecords('members', members, [
				{
					email,
					name: field(data, 'name'),
					instrument: field(data, 'instrument'),
					groups: formatRoles(parseRoles(field(data, 'groups')))
				}
			]);
		}),

	editMember: ({ request, locals }) =>
		change(locals, async () => {
			const data = await request.formData();
			const email = normalizeEmail(field(data, 'email'));
			const form = readMemberForm(data);
			if ('problem' in form) return form.problem;
			const members = await readTab('members');
			const row = members.rows.find((r) => normalizeEmail(r.values.email) === email);
			if (!row) return t.admin.memberGone;
			// Roles as ticked; the form lists every group the member has, so none is lost.
			const groups = [...new Set(data.getAll('group').map((value) => String(value).trim().slice(0, 100)).filter(Boolean))];
			await updateRecord('members', members, row.row, writable(members, { ...form.values, groups: groups.join(', ') }));
		}),

	removeMember: ({ request, locals }) =>
		change(locals, async () => {
			const email = normalizeEmail(field(await request.formData(), 'email'));
			const members = await readTab('members');
			await deleteRows(
				'members',
				members,
				members.rows.filter((row) => normalizeEmail(row.values.email) === email).map((row) => row.row)
			);
		}),

	/** What "Alle Daten löschen" would delete (#158), shown before anything happens. */
	erasePreview: async ({ request, locals }) => {
		requireRight(locals, 'mitglieder.verwalten');
		const email = normalizeEmail(field(await request.formData(), 'email'));
		try {
			return { erase: await previewErase(email) };
		} catch (error) {
			console.error('Previewing a deletion failed:', error);
			return fail(503, { message: t.messages.sheetFailed });
		}
	},

	/** Deletes a member and everything the app keeps about them, after the preview (#158). */
	erase: async ({ request, locals }) => {
		requireRight(locals, 'mitglieder.verwalten');
		const email = normalizeEmail(field(await request.formData(), 'email'));
		try {
			const done = await eraseMember(email);
			await refreshAfterWrite();
			return { saved: true, erased: done.name || done.email };
		} catch (error) {
			console.error('Deleting a member failed:', error);
			return fail(503, { message: t.erase.failed });
		}
	},

	grant: ({ request, locals }) =>
		change(locals, async () => {
			const data = await request.formData();
			const who = field(data, 'who');
			const right = field(data, 'right') as Right;
			if (!who || !RIGHTS.includes(right)) return t.messages.grantMissing;
			if (who.includes('@') && !EMAIL.test(who)) return t.admin.invalidEmail;
			const rights = await readTab('rights');
			if (rights.rows.some((row) => whoKey(row.values.who) === whoKey(who) && row.values.right.trim().toLowerCase() === right)) {
				return t.admin.grantExists;
			}
			await appendRecords('rights', rights, [{ who: who.includes('@') ? normalizeEmail(who) : who, right }]);
		}),

	addGroup: ({ request, locals }) =>
		change(locals, async () => {
			const data = await request.formData();
			const part = field(data, 'part');
			const players = splitNames(String(data.get('players') ?? '').slice(0, 500));
			if (!part || !players.length) return t.admin.groupMissing;
			const table = await readTab('instrumentGroups');
			// The first own row replaces the presets, so they're copied in first and stay in effect.
			const defaults = table.rows.length
				? []
				: Object.entries(config.sharedParts ?? {}).map(([name, list]) => ({ part: name, players: list.join(', ') }));
			await appendRecords('instrumentGroups', table, [
				...defaults,
				{ part, players: players.join(', '), mutual: data.get('mutual') === 'on' ? 'TRUE' : 'FALSE', note: field(data, 'note') }
			]);
		}),

	removeGroup: ({ request, locals }) =>
		change(locals, async () => {
			const data = await request.formData();
			const row = Number(data.get('row'));
			const table = await readTab('instrumentGroups');
			// The row number plus the part name, so a row that moved in the meantime isn't deleted by mistake.
			const target = table.rows.find((r) => r.row === row && normalize(r.values.part) === normalize(field(data, 'part')));
			if (!target) return t.admin.groupGone;
			await deleteRows('instrumentGroups', table, [target.row]);
		}),

	/**
	 * Personal access links: "show" the current one again, "new" (ends the old one and its
	 * sessions) or "revoke". The link is only ever shown to the admin, who sends it themselves.
	 */
	link: async ({ request, locals, url }) => {
		requireRight(locals, 'mitglieder.verwalten');
		const auth = authConfig();
		if (auth.mode !== 'on' || !auth.sessionSecret) return fail(400, { message: t.admin.linkUnavailable });
		const data = await request.formData();
		const email = normalizeEmail(field(data, 'email'));
		const mode = field(data, 'mode');
		let version = 0;
		const result = await change(locals, async () => {
			const members = await readTab('members');
			const row = members.rows.find((r) => normalizeEmail(r.values.email) === email);
			if (!row) return t.admin.memberGone;
			const current = parseLinkVersion(row.values.linkVersion);
			if (mode === 'show' && current > 0) {
				version = current;
				return;
			}
			version = mode === 'revoke' ? revokedLinkVersion(current) : nextLinkVersion(current);
			await updateRecord('members', members, row.row, { linkVersion: String(version) });
		});
		if ('status' in result || version <= 0) return result;
		return { ...result, link: { email, url: `${url.origin}/auth/link/${await linkToken(email, version, auth.sessionSecret)}` } };
	},

	/** A link for someone new, who fills in their own details; shown right away to copy and send. */
	invite: async ({ request, locals, url }) => {
		requireRight(locals, 'mitglieder.verwalten');
		if (authConfig().mode !== 'on') return fail(400, { message: t.admin.linkUnavailable });
		const data = await request.formData();
		const groups = [...new Set(data.getAll('group').map((value) => String(value).trim().slice(0, 100)).filter(Boolean))];
		try {
			const invite = await createInvite({ label: field(data, 'label'), groups: groups.join(', '), by: locals.access.user?.email ?? '' });
			return { invited: { id: invite.id, url: inviteUrl(url.origin, invite.id) } };
		} catch (error) {
			console.error('Making an invitation failed:', error);
			return fail(503, { message: t.invite.failed });
		}
	},

	/** Takes an invitation back before it's used. */
	inviteRevoke: async ({ request, locals }) => {
		requireRight(locals, 'mitglieder.verwalten');
		try {
			await removeInvite(field(await request.formData(), 'id'));
			return { inviteRevoked: true };
		} catch (error) {
			console.error('Revoking an invitation failed:', error);
			return fail(503, { message: t.invite.failed });
		}
	},

	/** A role's description and rights; a new name adds the role to "Gruppen". */
	setRole: ({ request, locals }) =>
		change(locals, async () => {
			const data = await request.formData();
			const name = field(data, 'name');
			if (!name || name.includes('@')) return t.admin.roleNameMissing;
			const wanted = RIGHTS.filter((right) => right !== 'ansehen' && data.getAll('right').includes(right));
			const [groups, rights] = await Promise.all([readTab('groups'), readTab('rights')]);
			const group = groups.rows.find((row) => normalize(row.values.name) === normalize(name));
			const description = field(data, 'description');
			if (!group) await appendRecords('groups', groups, [{ name, description }]);
			else if (data.has('description') && group.values.description !== description) {
				await updateRecord('groups', groups, group.row, { description });
			}
			const plan = planRoleRights(
				rights.rows.map((row) => ({ row: row.row, who: row.values.who, right: row.values.right })),
				group?.values.name ?? name,
				wanted
			);
			if (plan.add.length) await appendRecords('rights', rights, plan.add.map((right) => ({ who: group?.values.name ?? name, right })));
			await deleteRows('rights', rights, plan.remove);
		}),

	/** Removes a role and its rights. Members keep the name in "Gruppen" until edited; it grants nothing. */
	removeRole: ({ request, locals }) =>
		change(locals, async () => {
			const name = field(await request.formData(), 'name');
			const [groups, rights] = await Promise.all([readTab('groups'), readTab('rights')]);
			const plan = planRoleRights(
				rights.rows.map((row) => ({ row: row.row, who: row.values.who, right: row.values.right })),
				name,
				[]
			);
			await deleteRows('rights', rights, plan.remove);
			await deleteRows('groups', groups, groups.rows.filter((row) => normalize(row.values.name) === normalize(name)).map((row) => row.row));
		}),

	/** Adds the preset roles that are missing, with their rights. */
	addRoles: ({ locals }) =>
		change(locals, async () => {
			const [groups, rights] = await Promise.all([readTab('groups'), readTab('rights')]);
			const roles = missingRoles(config.roles ?? [], groups.rows.map((row) => ({ name: row.values.name })));
			if (!roles.length) return;
			await appendRecords('groups', groups, roles.map(({ name, description }) => ({ name, description })));
			await appendRecords('rights', rights, roles.flatMap(({ name, rights: list }) => list.map((right) => ({ who: name, right }))));
		}),

	revoke: ({ request, locals }) =>
		change(locals, async () => {
			const data = await request.formData();
			const who = whoKey(field(data, 'who'));
			const right = field(data, 'right').toLowerCase();
			const rights = await readTab('rights');
			await deleteRows(
				'rights',
				rights,
				rights.rows.filter((row) => whoKey(row.values.who) === who && row.values.right.trim().toLowerCase() === right).map((row) => row.row)
			);
		})
};
