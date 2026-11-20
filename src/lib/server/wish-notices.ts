import type { User } from '#lib/access/access.ts';
import { wishFollowers, type WishKind } from '#lib/feedback/feedback.ts';
import * as t from '#lib/i18n/texts.ts';
import { peopleWithRight } from '#lib/reminders/reminders.ts';
import { authConfig } from './auth/index.ts';
import { runInBackground } from './env.ts';
import { notify, pushReady } from './push/index.ts';
import { getAccessList } from './repertoire.ts';

/**
 * Notifications about wishes on the devices people allowed them on (#157): admins hear of a
 * new wish, and whoever wished something hears when it's answered, like everyone who gave it
 * a +1. Sent after the response, so saving never waits for a push service; failing only logs.
 */

/** Who looks after wishes, as on /wuensche. */
const MANAGE = 'mitglieder.verwalten';

const tab = (kind: WishKind) => (kind === 'feature' ? '/wuensche?art=funktion' : '/wuensche');

function send(what: string, work: () => Promise<unknown>) {
	if (!pushReady()) return;
	runInBackground(work().catch((error) => console.error(`${what} failed:`, error)));
}

/** "Neuer Stückwunsch: Sleigh Ride (Anderson)" to the admins, without the one who wished it. */
export function announceWish(wish: { kind: WishKind; title: string; composer: string; description: string }, by: User) {
	send('Announcing a new wish', async () => {
		const auth = authConfig();
		const admins = peopleWithRight(await getAccessList(), auth.mode === 'on' ? auth.bootstrapAdmins : [], MANAGE);
		const me = by.email.trim().toLowerCase();
		const body = wish.kind === 'piece' ? [wish.title, wish.composer && `(${wish.composer})`].filter(Boolean).join(' ') : wish.description || wish.title;
		await notify(
			admins.filter((email) => email !== me),
			{ title: t.wishes.pushNew[wish.kind], body: body.slice(0, 200), url: tab(wish.kind), tag: 'wish-new' }
		);
	});
}

/** "Antwort auf „Sleigh Ride“ – geplant: Im Dezemberkonzert" to whoever wished it and their +1s. */
export function announceAnswer(
	wish: { id: string; kind: WishKind; title: string; submittedBy: string; votes: string[] },
	status: string,
	answer: string,
	/** Who answered: they don't need to hear of it. */
	by: string
) {
	const people = wishFollowers(wish, by);
	if (!people.length) return;
	send('Announcing an answer to a wish', () =>
		notify(people, { title: t.wishes.pushAnswer(wish.title), body: t.wishes.pushStatus(status, answer).slice(0, 200), url: tab(wish.kind), tag: `wish-${wish.id}` })
	);
}
