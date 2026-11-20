import { error, fail, redirect } from '@sveltejs/kit';
import * as t from '#lib/i18n/texts.ts';
import { isOpen, pollFromForm } from '#lib/polls/polls.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { today } from '#lib/server/members.ts';
import { pollStore, pollViewer, visiblePolls } from '#lib/server/polls.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { Actions, PageServerLoad } from './$types';

/** Date polls (#95): the ones meant for you, open first; and a new one for those who plan dates. */
export const load: PageServerLoad = async ({ locals }) => {
	const store = pollStore();
	const viewer = await pollViewer(locals);
	if (!viewer) error(401, t.messages.signInFirst);
	if (!store) return { state: 'not-set-up' as const, open: [], closed: [], groups: [], plans: viewer.plans };

	const day = today();
	const polls = await Promise.all(
		(await visiblePolls(locals)).map(async (poll) => {
			const responses = (await store.get(poll.id))?.responses ?? [];
			return { ...poll, answers: responses.length, answered: responses.some((response) => response.email === viewer.email) };
		})
	);
	// Groups to address a poll to: the "Gruppen" tab and whatever members have in "Gruppen".
	const access = await getAccessList().catch(() => null);
	const groups = [...new Set([...(access?.groups.map((group) => group.name) ?? []), ...(access?.members.flatMap((member) => member.groups) ?? [])])].sort(
		(a, b) => a.localeCompare(b)
	);
	return {
		state: 'ready' as const,
		open: polls.filter((poll) => isOpen(poll, day)),
		closed: polls.filter((poll) => !isOpen(poll, day)),
		groups: viewer.plans ? groups : [],
		plans: viewer.plans
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireRight(locals, 'termine.planen');
		const store = pollStore();
		const viewer = await pollViewer(locals);
		if (!store || !viewer) return fail(503, { error: t.polls.notSetUp });
		const result = pollFromForm(await request.formData());
		if ('error' in result) return fail(400, { error: t.polls.errors[result.error] });
		let id: string;
		try {
			({ id } = await store.create(result.poll, viewer));
		} catch (cause) {
			console.error('Creating a poll failed:', cause);
			return fail(503, { error: t.polls.failed });
		}
		redirect(303, `/termine/${id}`);
	}
};
