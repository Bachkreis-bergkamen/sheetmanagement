import { fail, redirect } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { kummerFromForm, unreadForAuthor } from '#lib/kummer/kummer.ts';
import { authorKey, getLeitung, kummerStore } from '#lib/server/kummer.ts';
import { childNames, parentContext } from '#lib/server/parents.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Messages from a parent to the Leitung: the Kummerkasten's threads, always with the parent's
 * name and whose parent they are, so the Leitung knows whom to answer. Answers come back here.
 */

export const load: PageServerLoad = async ({ locals, url }) => {
	const parent = await parentContext(locals);
	const store = kummerStore();
	const key = await authorKey(parent.email);
	if (!store || !key) return { state: 'not-set-up' as const };
	const [leitung, mine, reads] = await Promise.all([getLeitung(), store.listByAuthor(key), store.readsOf(`author:${key}`)]);
	return {
		state: 'ready' as const,
		leitung: leitung.length > 0,
		from: signature(parent.name, parent.children),
		sent: url.searchParams.has('gesendet'),
		threads: mine.map((thread) => ({
			id: thread.id,
			subject: thread.subject,
			day: thread.createdAt.slice(0, 10),
			answered: !!thread.lastLeitungAt,
			unread: unreadForAuthor(thread, reads.get(thread.id)),
			closed: !!thread.closedAt
		}))
	};
};

/** "Paula Beispiel (Eltern von Mia)": how the Leitung sees the writer. */
const signature = (name: string, children: { name: string }[]) => (children.length ? `${name} (${t.parents.parentOf(childNames(children))})` : name);

export const actions: Actions = {
	send: async ({ request, locals }) => {
		const parent = await parentContext(locals);
		const store = kummerStore();
		const key = await authorKey(parent.email);
		const form = await request.formData();
		const values = { subject: String(form.get('subject') ?? ''), body: String(form.get('body') ?? '') };
		if (!store || !key) return fail(503, { error: t.kummer.notSetUp, values });
		// Always to the whole Leitung, always signed.
		form.delete('to');
		form.set('signed', 'on');
		const leitung = await getLeitung();
		const parsed = kummerFromForm(form, { leitung: leitung.map((person) => person.email), name: signature(parent.name, parent.children) });
		if ('problem' in parsed) return fail(400, { error: t.kummer.problems[parsed.problem], values });
		try {
			await store.create(parsed.kummer, key);
		} catch (cause) {
			console.error('Saving a parent’s message failed:', cause);
			return fail(503, { error: t.kummer.failed, values });
		}
		redirect(303, '/eltern/nachrichten?gesendet');
	}
};
