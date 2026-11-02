import { normalizeEmail } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { authConfig } from '../auth/index.ts';
import { signInLinkToken } from '../auth/mail-links.ts';
import { getStore } from '../db/index.ts';
import { orchestra } from '../env.ts';
import { getAccessList } from '../repertoire.ts';
import { mailReady, sendMail } from './index.ts';

/**
 * "Link per E-Mail schicken" on /anmelden (#123). The page always gives the same answer, so
 * nobody learns who is a member; the mail only goes to addresses in "Mitglieder" (and the
 * bootstrap admins). A few requests per hour and address, per email and per IP.
 */

const PER_EMAIL = 3;
// High enough for a whole school or rehearsal on one WLAN, which shares one address.
const PER_IP = 150;
const WINDOW_MINUTES = 60;

export const looksLikeEmail = (value: string) => /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(value);

export type SignInRequest = { state: 'sent'; work?: Promise<unknown> } | { state: 'limited' };

export async function requestSignInLink(raw: string, ip: string, origin: string, returnTo: string): Promise<SignInRequest> {
	const email = normalizeEmail(raw);
	const store = getStore();
	const [perEmail, perIp] = await Promise.all([store.hit(`sign-in-mail:${email}`, WINDOW_MINUTES), store.hit(`sign-in-ip:${ip}`, WINDOW_MINUTES)]);
	if (perIp > PER_IP) return { state: 'limited' };
	// Too many for this address: answered as if sent, so the limit says nothing about membership.
	if (perEmail > PER_EMAIL) return { state: 'sent' };
	return { state: 'sent', work: sendSignInLink(email, origin, returnTo) };
}

async function sendSignInLink(email: string, origin: string, returnTo: string): Promise<void> {
	const auth = authConfig();
	if (auth.mode !== 'on' || !(await mailReady())) return;
	const member = (await getAccessList())?.membersByEmail.get(email);
	if (!member && !auth.bootstrapAdmins.includes(email)) return;
	const token = await signInLinkToken(email, auth.sessionSecret);
	const link = `${origin}/auth/email/${token}${returnTo !== '/' ? `?weiter=${encodeURIComponent(returnTo)}` : ''}`;
	const firstName = member?.name.split(/\s+/)[0] ?? '';
	await sendMail(email, t.email.signInSubject(orchestra().name), t.email.signInBody(firstName, link));
}
