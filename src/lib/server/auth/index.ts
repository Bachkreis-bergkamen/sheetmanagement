import { error, type Cookies } from '@sveltejs/kit';
import { parseEmailList, resolveAccess, type Access, type Right, type User } from '#lib/access/access.ts';
import { DEMO_ADMIN, DEMO_MEMBER } from '../demo/data.ts';
import { getStore } from '../db/index.ts';
import { appEnv, isDemo } from '../env.ts';
import { readAccessList } from '../repertoire.ts';
import { linkValid } from './links.ts';
import { savedAccounts, withAccount, writeSaved } from './saved.ts';
import { SESSION_DAYS, signSession, verifySession, type Session } from './session.ts';
import { t } from '#lib/i18n/index.ts';

export const SESSION_COOKIE = 'session';
export const STATE_COOKIE = 'oauth_state';
const MIN_SECRET_LENGTH = 32;

export type AuthConfig =
	| {
			mode: 'off';
			/** "disabled": a client id is set, but FORCE_AUTH=false turned sign-in off. */
			reason: 'not-configured' | 'disabled';
	  }
	| {
			mode: 'on';
			/** Google sign-in is set up (GOOGLE_OAUTH_CLIENT_ID); without it only passwords and access links. */
			google: boolean;
			clientId: string;
			clientSecret: string;
			sessionSecret: string;
			bootstrapAdmins: string[];
			/** Settings that are missing or too weak; sign-in fails until they're fixed. */
			problems: string[];
	  };

/** FORCE_AUTH=true (or 1, yes, on): sign-in on without Google, with passwords and access links only. */
export function signInRequired(value: string | undefined): boolean {
	return ['true', '1', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

/** FORCE_AUTH=false (or 0, no, off) turns sign-in off; anything else, or nothing, leaves it on. */
export function signInForced(value: string | undefined): boolean {
	return !['false', '0', 'no', 'off'].includes((value ?? '').trim().toLowerCase());
}

/**
 * Sign-in is on as soon as GOOGLE_OAUTH_CLIENT_ID is set, or FORCE_AUTH=true for sign-in with
 * passwords and access links only. Otherwise the app stays open and read-only, as before
 * phase 5, so a deployment can be set up step by step. FORCE_AUTH=false turns it off again
 * without removing the client id, e.g. for an instance that should be open to everyone.
 */
export function authConfig(): AuthConfig {
	const env = appEnv();
	// The demo is "signed in" without Google: as the admin, or as a member to see their view.
	if (isDemo()) {
		return { mode: 'on', google: true, clientId: 'demo', clientSecret: 'demo', sessionSecret: 'demo'.repeat(8), bootstrapAdmins: [DEMO_ADMIN.email], problems: [] };
	}
	const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? '';
	if (!clientId && !signInRequired(env.FORCE_AUTH)) return { mode: 'off', reason: 'not-configured' };
	if (!signInForced(env.FORCE_AUTH)) return { mode: 'off', reason: 'disabled' };
	const google = !!clientId;
	const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? '';
	const sessionSecret = env.SESSION_SECRET?.trim() ?? '';
	const bootstrapAdmins = parseEmailList(env.BOOTSTRAP_ADMINS);
	const problems = [
		...(clientSecret || !google ? [] : [t.messages.notSet('GOOGLE_OAUTH_CLIENT_SECRET')]),
		...(sessionSecret.length >= MIN_SECRET_LENGTH ? [] : [t.messages.shortSecret(MIN_SECRET_LENGTH)]),
		...(bootstrapAdmins.length ? [] : [t.messages.noAdmins])
	];
	return { mode: 'on', google, clientId, clientSecret, sessionSecret, bootstrapAdmins, problems };
}

/** Signs someone in: a session cookie for SESSION_DAYS, whichever way they proved who they are. */
export async function startSession(cookies: Cookies, secret: string, session: Omit<Session, 'exp'>) {
	const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400;
	const token = await signSession({ ...session, exp }, secret);
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: SESSION_DAYS * 86_400
	});
	// On a device with several accounts kept (after "add account"), this one is kept too.
	const saved = await savedAccounts(cookies, secret);
	if (saved.length) writeSaved(cookies, withAccount(saved, { email: session.email, name: session.name, token }));
}

/** The signed-in person's session as signed, e.g. to renew it after a new password or link. */
export async function currentSession(cookies: Cookies): Promise<Session | null> {
	const auth = authConfig();
	return auth.mode === 'on' && auth.sessionSecret ? verifySession(cookies.get(SESSION_COOKIE), auth.sessionSecret) : null;
}

/** Without sign-in everyone may view, and nobody may change anything. */
const OPEN: Access = { user: null, member: true, bootstrapAdmin: false, rights: new Set<Right>(['ansehen']) };

/** Which demo user is "signed in": the admin by default, or the member (cookie set from the demo banner). */
export const DEMO_ROLE_COOKIE = 'demo_rolle';
export const demoUser = (cookies: Cookies) => (cookies.get(DEMO_ROLE_COOKIE) === 'mitglied' ? DEMO_MEMBER : DEMO_ADMIN);

export async function accessFromCookies(cookies: Cookies, auth: AuthConfig): Promise<Access> {
	if (auth.mode === 'off') return OPEN;
	if (isDemo()) {
		const user = demoUser(cookies);
		return resolveAccess(user, (await readAccessList()).list, auth.bootstrapAdmins);
	}
	const session = auth.sessionSecret ? await verifySession(cookies.get(SESSION_COOKIE), auth.sessionSecret) : null;
	const user: User | null = session ? { email: session.email, name: session.name } : null;
	if (!user) return resolveAccess(null, null, []);
	// A session from a password lasts until the password changes: checked against the account's stamp.
	if (session?.pw !== undefined) {
		const account = await getStore()
			.accountOf(user.email.toLowerCase())
			.catch(() => undefined);
		if (account === undefined) return { ...resolveAccess(user, null, []), unavailable: true };
		if (!account || account.stamp !== session.pw) return resolveAccess(null, null, []);
	}
	// A session from an access link lasts only as long as the link: always checked in the sheet.
	if (session?.link !== undefined) {
		const { list, failed } = await readAccessList();
		if (failed) return { ...resolveAccess(user, null, []), unavailable: true };
		const member = list?.membersByEmail.get(user.email.toLowerCase());
		if (!member || !linkValid(member.linkVersion, session.link)) return resolveAccess(null, null, []);
		return { ...resolveAccess(user, list, auth.bootstrapAdmins), viaLink: true };
	}
	// Bootstrap admins don't depend on the sheet, so a broken sheet can't lock them out.
	if (auth.bootstrapAdmins.includes(user.email.toLowerCase())) return resolveAccess(user, null, auth.bootstrapAdmins);
	const { list, failed } = await readAccessList();
	// Not "no access": an unreadable list says nothing about who's a member.
	if (failed) return { ...resolveAccess(user, null, []), unavailable: true };
	return resolveAccess(user, list, auth.bootstrapAdmins);
}

/** Pages anyone may open, signed in or not. */
export function isPublicPath(path: string): boolean {
	return (
		path === '/anmelden' ||
		path === '/zugang' ||
		// Linked from Google's sign-in screen, so they must be readable without an account.
		path === '/datenschutz' ||
		path === '/nutzungsbedingungen' ||
		// How to put the app on the home screen (#279): shared in the orchestra's chat before anyone signs in.
		path === '/install' ||
		path.startsWith('/auth/') ||
		// Answering a sign-up from a reminder email (#123): the signed link is the proof.
		path.startsWith('/antwort/') ||
		path === '/api/health' ||
		// Published concerts for the orchestra's website (#197): only what an organiser published.
		path === '/api/konzerte' ||
		path === '/api/konzerte.ics' ||
		// Concert tickets (docs/tickets-plan.md): the website's sale, and a buyer's tickets, whose
		// address holds the order's long random id.
		path.startsWith('/api/karten/') ||
		path.startsWith('/karte/')
	);
}

/** For actions and pages that change things: a 403 unless the right is held. */
export function requireRight(locals: App.Locals, right: Right) {
	if (!locals.access.rights.has(right)) {
		error(locals.access.user || locals.auth === 'off' ? 403 : 401, t.messages.noRight);
	}
}

/**
 * Setup and status pages: open while sign-in is off (that's how a new deployment is
 * set up), afterwards for admins only.
 */
export function requireAdminWhenSignInIsOn(locals: App.Locals) {
	if (locals.auth === 'on') requireRight(locals, 'mitglieder.verwalten');
}
