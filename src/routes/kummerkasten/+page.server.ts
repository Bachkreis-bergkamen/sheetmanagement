import { error, fail, redirect } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { isFor, kummerFromForm, unreadForAuthor, unreadForLeitung, type KummerThread } from '#lib/kummer/kummer.ts';
import { authorKey, getLeitung, KUMMER_RIGHT, kummerStore, type LeitungPerson } from '#lib/server/kummer.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { Actions, PageServerLoad } from './$types';

/** "an David Dirigent, Tim Trompeter", or the whole Leitung. */
const recipientsText = (thread: KummerThread, leitung: LeitungPerson[]) =>
	thread.recipients.length
		? t.kummer.for(thread.recipients.map((email) => leitung.find((person) => person.email === email)?.name ?? email.split('@')[0]).join(', '))
		: t.kummer.forAll;

/** The signed-in person, or the page says to sign in. */
function viewer(locals: App.Locals) {
	const email = locals.access.user?.email;
	if (locals.auth !== 'on' || !email) error(401, t.kummer.signIn);
	return normalizeEmail(email);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = viewer(locals);
	const store = kummerStore();
	const key = await authorKey(me);
	if (!store || !key) return { state: 'not-set-up' as const };
	const reader = locals.access.rights.has(KUMMER_RIGHT);
	const [leitung, mine, myReads, all, reads, access] = await Promise.all([
		getLeitung(),
		store.listByAuthor(key),
		store.readsOf(`author:${key}`),
		reader ? store.list() : [],
		reader ? store.readsOf(me) : new Map<string, string>(),
		getAccessList().catch(() => null)
	]);
	const member = access?.membersByEmail.get(me);
	const view = url.searchParams.get('ansicht');
	return {
		state: 'ready' as const,
		reader,
		tab: reader && view === 'eingang' ? ('inbox' as const) : view === 'meine' ? ('mine' as const) : ('write' as const),
		// For the form: names and roles only; the addresses are the values to tick.
		leitung: leitung.map(({ email, name, roles }) => ({ email, name, roles })),
		myName: member?.name ?? locals.access.user?.name ?? '',
		mine: mine.map((thread) => ({
			id: thread.id,
			subject: thread.subject,
			to: recipientsText(thread, leitung),
			signed: !!thread.authorName,
			date: thread.createdAt.slice(0, 10),
			answered: !!thread.lastLeitungAt,
			unread: unreadForAuthor(thread, myReads.get(thread.id)),
			closed: !!thread.closedAt
		})),
		// Never the writer's key; a name only when they gave it.
		inbox: all
			.filter((thread) => isFor(thread, me))
			.map((thread) => ({
				id: thread.id,
				subject: thread.subject,
				from: thread.authorName ?? null,
				to: recipientsText(thread, leitung),
				date: thread.lastAuthorAt.slice(0, 10),
				answered: !!thread.lastLeitungAt && thread.lastLeitungAt >= thread.lastAuthorAt,
				unread: unreadForLeitung(thread, reads.get(thread.id)),
				closed: !!thread.closedAt
			}))
	};
};

export const actions: Actions = {
	send: async ({ request, locals }) => {
		const me = viewer(locals);
		const store = kummerStore();
		const key = await authorKey(me);
		const form = await request.formData();
		const values = { subject: String(form.get('subject') ?? ''), body: String(form.get('body') ?? ''), to: form.getAll('to').map(String), signed: form.get('signed') === 'on' };
		if (!store || !key) return fail(503, { error: t.kummer.notSetUp, values });
		const [leitung, access] = await Promise.all([getLeitung(), getAccessList().catch(() => null)]);
		const name = access?.membersByEmail.get(me)?.name ?? locals.access.user?.name ?? '';
		const parsed = kummerFromForm(form, { leitung: leitung.map((person) => person.email), name });
		if ('problem' in parsed) return fail(400, { error: t.kummer.problems[parsed.problem], values });
		let id: string;
		try {
			({ id } = await store.create(parsed.kummer, key));
		} catch (cause) {
			console.error('Saving a Kummerkasten message failed:', cause);
			return fail(503, { error: t.kummer.failed, values });
		}
		redirect(303, `/kummerkasten/${id}?gesendet`);
	}
};
