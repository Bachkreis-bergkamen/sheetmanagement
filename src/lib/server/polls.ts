import { env } from 'cloudflare:workers';
import { normalizeEmail } from '#lib/access/access.ts';
import { canSeePoll, isOpen, type Poll } from '#lib/polls/polls.ts';
import { DEMO_ADMIN } from './demo/data.ts';
import { isDemo } from './env.ts';
import { MemoryPollStore, perDatabase, SqlPollStore, type PollStore } from './polls-store.ts';
import type { D1 } from './db/sql.ts';
import { getAccessList } from './repertoire.ts';

/**
 * Date polls (#95) live in D1, the binding "DB" in wrangler.toml (#161); without it the feature
 * says it isn't set up. The demo keeps them in memory, with a sample poll.
 */

let demo: MemoryPollStore | null = null;
const sql = perDatabase((db) => new SqlPollStore(db));

export function pollStore(): PollStore | null {
	if (isDemo()) return (demo ??= demoPolls());
	const db = (env as { DB?: D1 }).DB;
	return db ? sql(db) : null;
}

/** Back to the sample poll, with the rest of the demo. */
export function resetDemoPolls() {
	demo = null;
}

export interface PollViewer {
	email: string;
	name: string;
	groups: string[];
	/** Creates and closes polls, and sees them all ("termine.planen"). */
	plans: boolean;
}

export async function pollViewer(locals: App.Locals): Promise<PollViewer | null> {
	const user = locals.access.user;
	if (!user) return null;
	const member = (await getAccessList().catch(() => null))?.membersByEmail.get(normalizeEmail(user.email));
	return { email: normalizeEmail(user.email), name: member?.name ?? user.name, groups: member?.groups ?? [], plans: locals.access.rights.has('termine.planen') };
}

/** The polls someone may see, newest first; none when the store or the person is missing. */
export async function visiblePolls(locals: App.Locals): Promise<Poll[]> {
	const store = pollStore();
	const viewer = await pollViewer(locals);
	if (!store || !viewer) return [];
	return (await store.list()).filter((poll) => canSeePoll(poll, viewer));
}

/** Open polls meant for you that you haven't answered yet: "Wartet auf dich" on the start page. */
export async function unansweredPolls(locals: App.Locals, today: string): Promise<Poll[]> {
	const store = pollStore();
	const viewer = await pollViewer(locals);
	if (!store || !viewer) return [];
	return (await store.unanswered(viewer.email)).filter((poll) => isOpen(poll, today) && canSeePoll(poll, viewer));
}

const DAY_MS = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);
/** The Saturday in about `weeks` weeks. */
const saturday = (weeks: number) => {
	const date = new Date(Date.now() + weeks * 7 * DAY_MS);
	return day(weeks * 7 + ((6 - date.getUTCDay() + 7) % 7));
};

/** The day after that Saturday. */
const sunday = (weeks: number) => new Date(Date.parse(saturday(weeks)) + DAY_MS).toISOString().slice(0, 10);

/** A rehearsal weekend the orga team is still deciding on, with a few answers in. */
function demoPolls(): MemoryPollStore {
	const store = new MemoryPollStore();
	const created = new Date(Date.now() - 2 * DAY_MS).toISOString();
	void store
		.create(
			{
				title: 'Probenwochenende',
				note: 'Samstag und Sonntag in der Aula; wir brauchen den Termin bis Ende des Monats für die Raumbuchung.',
				// Each choice a whole weekend, Saturday and Sunday.
				options: [6, 7, 8, 9].map((weeks, i) => ({ id: `o${i + 1}`, date: saturday(weeks), until: sunday(weeks), start: '10:00', end: '17:00' })),
				groups: ['Orga', 'Dirigat', 'Vorstand'],
				deadline: day(9)
			},
			DEMO_ADMIN,
			created
		)
		.then(async ({ id }) => {
			await store.respond(id, {
				email: 'david@example.org',
				name: 'David Dirigent',
				choices: { o1: 'no', o2: 'yes', o3: 'yes', o4: 'maybe' },
				updatedAt: created
			});
			await store.respond(id, {
				email: 'tim@example.org',
				name: 'Tim Trompeter',
				choices: { o1: 'maybe', o2: 'yes', o3: 'no', o4: 'yes' },
				comment: 'Am 3. Termin bin ich auf einer Hochzeit.',
				updatedAt: created
			});
		});
	return store;
}
