import { normalizeEmail } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { authConfig } from '../auth/index.ts';
import { setPasswordToken } from '../auth/password.ts';
import { getStore } from '../db/index.ts';
import { orchestra } from '../env.ts';
import { getAccessList } from '../repertoire.ts';
import { mailReady, sendMail } from './index.ts';

/**
 * "Konto anlegen / Passwort vergessen" (/auth/passwort): a link by email to set a password.
 * Anyone may ask, so people can sign up themselves; whoever opens the link proves the address
 * is theirs, and what they may see is still up to "Mitglieder" (a new person asks for access
 * on /zugang). The page always gives the same answer, so nobody learns who has an account.
 * A few requests per hour and address, per email and per IP.
 */

const PER_EMAIL = 3;
// Lower than for members' sign-in before: the mail can go to any address, so this keeps the
// orchestra's account from being used to send lots of mail. A rehearsal on one WLAN still fits.
const PER_IP = 30;
const WINDOW_MINUTES = 60;

export const looksLikeEmail = (value: string) => /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(value);

export type PasswordLinkRequest = { state: 'sent'; work?: Promise<unknown> } | { state: 'limited' };

export async function requestPasswordLink(raw: string, ip: string, origin: string): Promise<PasswordLinkRequest> {
	const email = normalizeEmail(raw);
	const store = getStore();
	const [perEmail, perIp] = await Promise.all([store.hit(`password-mail:${email}`, WINDOW_MINUTES), store.hit(`password-ip:${ip}`, WINDOW_MINUTES)]);
	if (perIp > PER_IP) return { state: 'limited' };
	// Too many for this address: answered as if sent, so the limit says nothing about accounts.
	if (perEmail > PER_EMAIL) return { state: 'sent' };
	return { state: 'sent', work: sendPasswordLink(email, origin) };
}

async function sendPasswordLink(email: string, origin: string): Promise<void> {
	const auth = authConfig();
	if (auth.mode !== 'on' || !(await mailReady())) return;
	const account = await getStore().accountOf(email);
	const token = await setPasswordToken(email, account?.stamp ?? '', auth.sessionSecret);
	const link = `${origin}/auth/passwort/${token}`;
	const member = (await getAccessList())?.membersByEmail.get(email);
	const firstName = member?.name.split(/\s+/)[0] ?? '';
	const name = orchestra().name;
	if (account) await sendMail(email, t.password.resetSubject(name), t.password.resetBody(firstName, link));
	else await sendMail(email, t.password.newSubject(name), t.password.newBody(firstName, name, link));
}
