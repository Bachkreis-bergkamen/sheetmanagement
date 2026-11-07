import { error, fail } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { authorDay, isFor, replyFromForm } from '#lib/kummer/kummer.ts';
import { authorKey, getLeitung, KUMMER_RIGHT, kummerStore } from '#lib/server/kummer.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * One thread, for the writer or for the Leitung it went to. Which of the two someone is comes
 * from the server alone: the writer by their key, the Leitung by the right and the recipients.
 */
async function open(locals: App.Locals, id: string) {
	const email = locals.access.user?.email;
	if (locals.auth !== 'on' || !email) error(401, t.kummer.signIn);
	const me = normalizeEmail(email);
	const store = kummerStore();
	const key = await authorKey(me);
	if (!store || !key) error(404, t.kummer.notSetUp);
	const found = await store.get(id);
	if (!found) error(404, t.kummer.gone);
	const role = found.authorKey === key ? ('author' as const) : locals.access.rights.has(KUMMER_RIGHT) && isFor(found.thread, me) ? ('leitung' as const) : null;
	if (!role) error(404, t.kummer.gone);
	return { store, me, key, role, ...found };
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { store, me, key, role, thread, messages } = await open(locals, params.id);
	await store.markRead(thread.id, role === 'author' ? `author:${key}` : me);
	const leitung = await getLeitung();
	const nameOf = (email: string) => leitung.find((person) => person.email === email)?.name ?? email.split('@')[0];
	return {
		role,
		sent: url.searchParams.has('gesendet'),
		thread: {
			id: thread.id,
			subject: thread.subject,
			to: thread.recipients.length ? t.kummer.for(thread.recipients.map(nameOf).join(', ')) : t.kummer.forAll,
			from: thread.authorName ?? null,
			closed: !!thread.closedAt
		},
		messages: messages.map((message) => ({
			id: message.id,
			mine: message.fromAuthor ? role === 'author' : message.senderEmail === me,
			fromAuthor: message.fromAuthor,
			// The writer as the Leitung sees them: their name only if they gave it.
			who: message.fromAuthor
				? role === 'author'
					? t.kummer.you
					: (thread.authorName ?? t.kummer.anonymous)
				: message.senderEmail === me
					? t.kummer.you
					: (message.senderName ?? t.kummer.anonymous),
			// The writer's messages to the Leitung carry the day only, never the time.
			when: message.fromAuthor && role === 'leitung' ? authorDay(message.createdAt) : message.createdAt,
			withTime: !(message.fromAuthor && role === 'leitung'),
			body: message.body
		}))
	};
};

export const actions: Actions = {
	reply: async ({ request, locals, params }) => {
		const { store, me, key, role, thread } = await open(locals, params.id);
		const parsed = replyFromForm(await request.formData());
		if ('problem' in parsed) return fail(400, { error: t.kummer.problems[parsed.problem] });
		try {
			if (role === 'author') {
				await store.reply(thread.id, { fromAuthor: true, body: parsed.body });
				await store.markRead(thread.id, `author:${key}`);
			} else {
				const member = (await getAccessList().catch(() => null))?.membersByEmail.get(me);
				await store.reply(thread.id, { fromAuthor: false, senderEmail: me, senderName: member?.name ?? locals.access.user?.name ?? me, body: parsed.body });
				await store.markRead(thread.id, me);
			}
		} catch (cause) {
			console.error('Saving a Kummerkasten reply failed:', cause);
			return fail(503, { error: t.kummer.failed });
		}
		return { replied: true };
	},

	close: async ({ request, locals, params }) => {
		const { store, role, thread } = await open(locals, params.id);
		if (role !== 'leitung') error(403, t.messages.noRight);
		const closed = (await request.formData()).get('closed') === 'true';
		await store.setClosed(thread.id, closed);
		return { closedSaved: closed };
	}
};
