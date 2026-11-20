import * as t from '#lib/i18n/texts.ts';
import { getStore, type PushDevice } from '../db/index.ts';
import { orchestra } from '../env.ts';
import { mailAccount, sendMail, type MailAccount } from '../mail/index.ts';
import { notify, pushReady, type Notice } from '../push/index.ts';

/**
 * How a reminder reaches someone (#157, #123): on their devices if they allowed
 * notifications, else by email, unless they turned that off on /profil. Push comes first:
 * it costs nothing and needs no mail account; email is for members without push.
 */

export interface Channels {
	/** Every device with notifications on; empty without the push keys. */
	devices: PushDevice[];
	/** The account that sends email; null while none is connected. */
	mail: MailAccount | null;
	optOut: Set<string>;
}

export async function channels(): Promise<Channels> {
	const store = getStore();
	const [devices, mail] = await Promise.all([pushReady() ? store.allPush() : [], mailAccount()]);
	return { devices, mail, optOut: mail ? await store.mailOptOuts() : new Set() };
}

/** Push keys or a mail account: reminders can go out at all. */
export const channelsSetUp = (ch: Channels) => pushReady() || !!ch.mail;

export function reachable(email: string, ch: Channels): boolean {
	return ch.devices.some((device) => device.email === email) || (!!ch.mail && !ch.optOut.has(email));
}

/** The notice as a plain-text mail: greeting, text, extra lines (e.g. answer links), the link into the app. */
export function mailText(notice: Notice, origin: string, { name = '', lines = [] as string[] } = {}): string {
	return [
		t.email.hello(name.split(/\s+/)[0] ?? ''),
		'',
		notice.body,
		...(lines.length ? ['', ...lines] : []),
		'',
		t.email.openInApp,
		`${origin}${notice.url}`,
		'',
		'-- ',
		t.email.footer(orchestra().name, `${origin}/profil#email`)
	].join('\n');
}

/** Sends one notice to one person; says how it got there, or null if it didn't. */
export async function deliver(
	email: string,
	notice: Notice,
	ch: Channels,
	mail: { name?: string; lines?: string[] } = {}
): Promise<'push' | 'mail' | null> {
	if (ch.devices.some((device) => device.email === email)) {
		const reached = await notify([email], notice, ch.devices);
		if (reached.size) return 'push';
	}
	if (ch.mail && !ch.optOut.has(email)) {
		if (await sendMail(email, notice.title, mailText(notice, ch.mail.origin, mail))) return 'mail';
	}
	return null;
}
