import { fail } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { noticeFor, noticeFromForm } from '#lib/parents/notices.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { runInBackground } from '#lib/server/env.ts';
import { parentNoticeStore } from '#lib/server/parent-notices.ts';
import { notify } from '#lib/server/push/index.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { Actions, PageServerLoad } from './$types';

/** Notices to the parents of young players: written here, shown in their area, sent to their devices. */

const RIGHT = 'eltern.informieren';

export const load: PageServerLoad = async ({ locals }) => {
	requireRight(locals, RIGHT);
	const store = parentNoticeStore();
	if (!store) return { state: 'not-set-up' as const };
	const [notices, list] = await Promise.all([store.list(), getAccessList().catch(() => null)]);
	const parents = list?.members.filter((member) => member.children.length) ?? [];
	return {
		state: 'ready' as const,
		orchestras: config.orchestras,
		parents: parents.length,
		notices: notices.map(({ id, title, body, orchestras, byName, createdAt }) => ({
			id,
			title,
			body,
			orchestras,
			byName,
			day: createdAt.slice(0, 10),
			// How many parents it reaches: those with a child in one of its orchestras.
			reaches: parents.filter((parent) => noticeFor({ orchestras }, parent.children.map((child) => list!.membersByEmail.get(child)?.orchestras ?? []))).length
		}))
	};
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		requireRight(locals, RIGHT);
		const store = parentNoticeStore();
		const form = await request.formData();
		const values = { title: String(form.get('title') ?? ''), body: String(form.get('body') ?? ''), orchestras: form.getAll('orchestra').map(String) };
		if (!store) return fail(503, { error: t.parents.notices.notSetUp, values });
		const list = await getAccessList().catch(() => null);
		const email = normalizeEmail(locals.access.user?.email ?? '');
		const parsed = noticeFromForm(form, { orchestras: config.orchestras, byEmail: email, byName: list?.membersByEmail.get(email)?.name ?? locals.access.user?.name ?? '' });
		if ('problem' in parsed) return fail(400, { error: t.parents.notices.problems[parsed.problem], values });
		try {
			const notice = await store.create(parsed.notice);
			// On the parents' devices too, where they allowed notifications.
			const parents = (list?.members ?? []).filter(
				(member) => member.children.length && noticeFor(notice, member.children.map((child) => list!.membersByEmail.get(child)?.orchestras ?? []))
			);
			if (parents.length) runInBackground(notify(parents.map((parent) => parent.email), { title: notice.title, body: notice.body.slice(0, 140), url: '/eltern', tag: `eltern-${notice.id}` }));
		} catch (cause) {
			console.error('Saving a notice to parents failed:', cause);
			return fail(503, { error: t.parents.notices.failed, values });
		}
		return { added: true };
	},

	remove: async ({ request, locals }) => {
		requireRight(locals, RIGHT);
		const store = parentNoticeStore();
		if (!store) return fail(503, { error: t.parents.notices.notSetUp });
		await store.remove(String((await request.formData()).get('id') ?? ''));
		return { removed: true };
	}
};
