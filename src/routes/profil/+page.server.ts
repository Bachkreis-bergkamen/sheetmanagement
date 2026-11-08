import { fail, redirect } from '@sveltejs/kit';
import { currentStatus, normalizeEmail, parseLinkVersion } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { commonInstruments, parseInstruments, playableInstruments } from '#lib/music/my-parts.ts';
import { readMemberForm, today, writable } from '#lib/server/members.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import { setPassword, withinAttempts } from '#lib/server/auth/accounts.ts';
import { authConfig, currentSession, startSession } from '#lib/server/auth/index.ts';
import { passwordProblem, verifyPassword } from '#lib/server/auth/password.ts';
import { feedToken } from '#lib/server/auth/feed.ts';
import { isOn } from '#lib/server/env.ts';
import { getStore } from '#lib/server/db/index.ts';
import { vapidKeys } from '#lib/server/push/index.ts';
import { mailReady } from '#lib/server/mail/index.ts';
import { linkToken, nextLinkVersion, revokedLinkVersion } from '#lib/server/auth/links.ts';
import { readOutcome } from '#lib/tour/tour.ts';
import { readTab, refreshAfterWrite, SheetLayoutError, updateRecord } from '#lib/server/sheet-writes.ts';
import type { Actions, PageServerLoad } from './$types';

/** A member's own row in "Mitglieder": name, instruments, orchestras and status. Groups and rights stay with /admin. */
export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const user = locals.access.user;
	if (locals.auth === 'off' || !user) redirect(303, '/meine-noten');
	const list = await getAccessList();
	const member = list?.membersByEmail.get(normalizeEmail(user.email));
	if (!member) return { member: null, email: user.email };
	return {
		email: member.email,
		member: {
			name: member.name,
			choices: parseInstruments(member.instrument ?? '', config),
			orchestras: member.orchestras,
			status: member.status,
			pausedUntil: member.pausedUntil,
			current: currentStatus(member, today()),
			groups: member.groups
		},
		feed: await feed(member.email, member.feedVersion, !!list?.tables.members?.missing.includes('feedVersion'), url.origin),
		password: await password(member.email, cookies),
		accessLink: accessLink(member.linkVersion, !!list?.tables.members?.missing.includes('linkVersion'), !!locals.access.viaLink),
		push: await push(member.email),
		mail: await mail(member.email),
		practice: await practice(member.email),
		instruments: playableInstruments(config),
		common: commonInstruments(config),
		orchestras: config.orchestras
	};
};

/** The personal calendar link (#122): its address while valid, else whether one can be made. */
async function feed(email: string, version: number, missingColumn: boolean, origin: string) {
	const auth = authConfig();
	if (auth.mode !== 'on' || !isOn('calendarFeed')) return null;
	if (missingColumn) return { state: 'not-set-up' as const };
	if (version < 1) return { state: 'none' as const };
	const url = `${origin}/kalender/${await feedToken(email, version, auth.sessionSecret)}.ics`;
	return { state: 'active' as const, url, webcal: url.replace(/^https?:/, 'webcal:') };
}

/** Email and password sign-in: whether the member has a password, and signed in with it now. */
async function password(email: string, cookies: import('@sveltejs/kit').Cookies) {
	if (authConfig().mode !== 'on') return null;
	const account = await getStore()
		.accountOf(email)
		.catch(() => undefined);
	if (account === undefined) return null;
	return { has: !!account, current: (await currentSession(cookies))?.pw !== undefined };
}

/** The personal access link: members make, renew and revoke their own; the address is only shown right after. */
function accessLink(version: number, missingColumn: boolean, viaLink: boolean) {
	if (authConfig().mode !== 'on') return null;
	if (missingColumn) return { state: 'not-set-up' as const, viaLink };
	return { state: version > 0 ? ('active' as const) : ('none' as const), viaLink };
}

/** Notifications (#157): the key the browser subscribes with, and the member's devices; null while not set up. */
async function push(email: string) {
	const keys = vapidKeys();
	if (!keys) return null;
	const devices = await getStore()
		.pushOf(email)
		.catch(() => []);
	return { publicKey: keys.publicKey, endpoints: devices.map((device) => device.endpoint) };
}

/** Reminders by email (#123): whether they're on for this member; null while no account sends mail. */
async function mail(email: string) {
	if (!(await mailReady())) return null;
	const off = await getStore()
		.mailOptOuts()
		.then((optOut) => optOut.has(email))
		.catch(() => false);
	return { off };
}

/** Practice time: whether it's on and the member's own days; only ever loaded for the signed-in member. */
async function practice(email: string) {
	const store = getStore();
	const member = normalizeEmail(email);
	try {
		const [on, days, marks] = await Promise.all([store.practiceOn(member), store.practiceOf(member), store.marksOf(member)]);
		// Notes in the parts (practice viewer): in how many parts, for deleting them all.
		return { on, days, today: today(), markedParts: new Set(marks.map((page) => page.file)).size };
	} catch (error) {
		console.error('Loading practice time failed:', error);
		return null;
	}
}

/** A new link (a higher version) or revoking (the version made negative), on the member's own row. */
async function changeFeed(locals: App.Locals, next: (current: number) => number) {
	const user = locals.access.user;
	if (locals.auth === 'off' || !user) redirect(303, '/anmelden');
	if (!isOn('calendarFeed')) return fail(404, { feedMessage: t.error.notFound });
	try {
		const members = await readTab('members');
		const email = normalizeEmail(user.email);
		const row = members.rows.find((r) => normalizeEmail(r.values.email) === email);
		if (!row) return fail(404, { feedMessage: t.profile.gone });
		const current = Number.parseInt(row.values.feedVersion, 10) || 0;
		await updateRecord('members', members, row.row, { feedVersion: String(next(current)) });
		await refreshAfterWrite();
		return { feedSaved: true };
	} catch (error) {
		if (error instanceof SheetLayoutError) return fail(409, { feedMessage: t.feed.notSetUp });
		console.error('Changing a calendar link failed:', error);
		return fail(503, { feedMessage: t.feed.failed });
	}
}

export const actions: Actions = {
	/**
	 * Sets or changes the member's password. Changing one needs the current password, so a
	 * session left open somewhere can't take the account over; a forgotten one is reset by email.
	 */
	password: async ({ locals, request, cookies, getClientAddress }) => {
		const user = locals.access.user;
		const auth = authConfig();
		if (auth.mode === 'off' || !user) redirect(303, '/anmelden');
		const email = normalizeEmail(user.email);
		const data = await request.formData();
		const next = String(data.get('password') ?? '');
		const problem = passwordProblem(next, String(data.get('repeat') ?? ''));
		if (problem) return fail(400, { passwordProblem: problem });
		try {
			const account = await getStore().accountOf(email);
			if (account) {
				if (!(await withinAttempts(email, getClientAddress()))) return fail(429, { passwordMessage: t.password.signInErrors.limited });
				if (!(await verifyPassword(String(data.get('current') ?? ''), account.passwordHash))) {
					return fail(400, { passwordMessage: t.password.wrongCurrent });
				}
			}
			const stamp = await setPassword(email, next);
			// Signed in with the old password: this session goes on with the new one, all others end.
			const session = await currentSession(cookies);
			if (session?.pw !== undefined) await startSession(cookies, auth.sessionSecret, { email: session.email, name: session.name, pw: stamp });
			return { passwordSaved: true };
		} catch (error) {
			console.error('Setting a password failed:', error);
			return fail(503, { passwordMessage: t.password.failed });
		}
	},

	/**
	 * The member's own access link, like the one an admin makes in /admin: "show" the current one
	 * again, "new" (ends the old one and its sessions) or "revoke".
	 */
	link: async ({ locals, request, cookies, url }) => {
		const user = locals.access.user;
		const auth = authConfig();
		if (auth.mode === 'off' || !user) redirect(303, '/anmelden');
		if (!auth.sessionSecret) return fail(400, { linkMessage: t.admin.linkUnavailable });
		const mode = String((await request.formData()).get('mode') ?? '');
		if (mode !== 'show' && mode !== 'new' && mode !== 'revoke') return fail(400, { linkMessage: t.messages.badRequest });
		const email = normalizeEmail(user.email);
		let version: number;
		try {
			const members = await readTab('members');
			const row = members.rows.find((r) => normalizeEmail(r.values.email) === email);
			if (!row) return fail(404, { linkMessage: t.profile.gone });
			const current = parseLinkVersion(row.values.linkVersion);
			if (mode === 'show' && current > 0) version = current;
			else {
				version = mode === 'revoke' ? revokedLinkVersion(current) : nextLinkVersion(current);
				await updateRecord('members', members, row.row, { linkVersion: String(version) });
				await refreshAfterWrite();
			}
		} catch (error) {
			if (error instanceof SheetLayoutError) return fail(409, { linkMessage: t.feed.notSetUp });
			console.error('Changing an access link failed:', error);
			return fail(503, { linkMessage: t.feed.failed });
		}
		// Signed in with the old link: this session goes on with the new one.
		const session = await currentSession(cookies);
		if (session?.link !== undefined && version > 0) await startSession(cookies, auth.sessionSecret, { email: session.email, name: session.name, link: version });
		if (version <= 0) return { linkRevoked: true };
		return { link: `${url.origin}/auth/link/${await linkToken(email, version, auth.sessionSecret)}` };
	},

	feed: ({ locals }) => changeFeed(locals, nextLinkVersion),
	feedRevoke: ({ locals }) => changeFeed(locals, revokedLinkVersion),

	/** Turns reminders by email off or on again; kept in the store, not the sheet. */
	mail: async ({ locals, request }) => {
		const user = locals.access.user;
		if (locals.auth === 'off' || !user) redirect(303, '/anmelden');
		const off = (await request.formData()).get('off') === 'true';
		try {
			await getStore().setMailOptOut(normalizeEmail(user.email), off);
			return { mailSaved: true };
		} catch (error) {
			console.error('Changing email reminders failed:', error);
			return fail(503, { mailMessage: t.email.profileFailed });
		}
	},

	/** Practice time on or off; turning it off keeps what was recorded until it's deleted. */
	practice: async ({ locals, request }) => {
		const user = locals.access.user;
		if (locals.auth === 'off' || !user) redirect(303, '/anmelden');
		const on = (await request.formData()).get('on') === 'true';
		try {
			await getStore().setPracticeOn(normalizeEmail(user.email), on);
			return { practiceSaved: true };
		} catch (error) {
			console.error('Changing practice time failed:', error);
			return fail(503, { practiceMessage: t.practice.failed });
		}
	},

	/** Forgets all of the member's own practice time. */
	practiceDelete: async ({ locals }) => {
		const user = locals.access.user;
		if (locals.auth === 'off' || !user) redirect(303, '/anmelden');
		try {
			await getStore().deletePractice(normalizeEmail(user.email));
			return { practiceDeleted: true };
		} catch (error) {
			console.error('Deleting practice time failed:', error);
			return fail(503, { practiceMessage: t.practice.failed });
		}
	},

	/** Forgets all of the member's own notes in the parts. */
	marksDelete: async ({ locals }) => {
		const user = locals.access.user;
		if (locals.auth === 'off' || !user) redirect(303, '/anmelden');
		try {
			await getStore().deleteMarks(normalizeEmail(user.email));
			return { marksDeleted: true };
		} catch (error) {
			console.error('Deleting notes failed:', error);
			return fail(503, { practiceMessage: t.practice.failed });
		}
	},

	/** How the tour ended (finished or skipped), so it isn't offered again; kept in the store, like the opt-out. */
	tour: async ({ locals, request }) => {
		const user = locals.access.user;
		if (locals.auth === 'off' || !user) redirect(303, '/anmelden');
		const outcome = readOutcome((await request.formData()).get('outcome'));
		if (!outcome) return fail(400, { tourSaved: false });
		try {
			await getStore().setTour(normalizeEmail(user.email), outcome);
			return { tourSaved: true };
		} catch (error) {
			console.error('Saving the tour state failed:', error);
			return fail(503, { tourSaved: false });
		}
	},

	save: async ({ locals, request }) => {
		const user = locals.access.user;
		if (locals.auth === 'off' || !user) redirect(303, '/anmelden');
		const form = readMemberForm(await request.formData());
		if ('problem' in form) return fail(400, { message: form.problem });
		try {
			// Only the member's own row, found by the signed-in email.
			const members = await readTab('members');
			const email = normalizeEmail(user.email);
			const row = members.rows.find((r) => normalizeEmail(r.values.email) === email);
			if (!row) return fail(404, { message: t.profile.gone });
			await updateRecord('members', members, row.row, writable(members, { ...form.values, name: form.values.name || row.values.name }));
			await refreshAfterWrite();
			return { saved: true };
		} catch (error) {
			if (error instanceof SheetLayoutError) return fail(409, { message: error.message });
			console.error('Saving a profile failed:', error);
			return fail(503, { message: t.profile.failed });
		}
	}
};
