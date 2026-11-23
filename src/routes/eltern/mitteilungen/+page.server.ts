import { fail } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import * as t from '#lib/i18n/texts.ts';
import { noticeFor, noticeFromForm } from '#lib/parents/notices.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { runInBackground } from '#lib/server/env.ts';
import { parentNoticeStore } from '#lib/server/parent-notices.ts';
import { takingPart } from '#lib/server/parents.ts';
import { notify } from '#lib/server/push/index.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Notices to the parents of young players: written here, shown in their area, sent to their
 * devices. For all parents, those of some orchestras, or those of one date's players (#299).
 */

const RIGHT = 'eltern.informieren';

export const load: PageServerLoad = async ({ locals }) => {
	requireRight(locals, RIGHT);
	const store = parentNoticeStore();
	if (!store) return { state: 'not-set-up' as const };
	const [notices, list, { takesPart, dates }] = await Promise.all([store.list(), getAccessList().catch(() => null), takingPart()]);
	const parents = list?.members.filter((member) => member.children.length) ?? [];
	const childrenOf = (parent: (typeof parents)[number]) => parent.children.map((child) => list!.membersByEmail.get(child) ?? { email: child, orchestras: [] });
	return {
		state: 'ready' as const,
		orchestras: config.orchestras,
		dates,
		parents: parents.length,
		notices: notices.map((notice) => ({
			id: notice.id,
			title: notice.title,
			body: notice.body,
			orchestras: notice.orchestras,
			event: notice.event,
			byName: notice.byName,
			day: notice.createdAt.slice(0, 10),
			// How many parents it reaches: those with a child in one of its orchestras, or taking part in its date.
			reaches: parents.filter((parent) => noticeFor(notice, childrenOf(parent), takesPart)).length
		}))
	};
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		requireRight(locals, RIGHT);
		const store = parentNoticeStore();
		const form = await request.formData();
		const values = {
			title: String(form.get('title') ?? ''),
			body: String(form.get('body') ?? ''),
			orchestras: form.getAll('orchestra').map(String),
			event: String(form.get('event') ?? '')
		};
		if (!store) return fail(503, { error: t.parents.notices.notSetUp, values });
		const [list, { takesPart, dates }] = await Promise.all([getAccessList().catch(() => null), takingPart()]);
		const email = normalizeEmail(locals.access.user?.email ?? '');
		const parsed = noticeFromForm(form, { orchestras: config.orchestras, dates, byEmail: email, byName: list?.membersByEmail.get(email)?.name ?? locals.access.user?.name ?? '' });
		if ('problem' in parsed) return fail(400, { error: t.parents.notices.problems[parsed.problem], values });
		try {
			const notice = await store.create(parsed.notice);
			// On the parents' devices too, where they allowed notifications.
			const parents = (list?.members ?? []).filter(
				(member) =>
					member.children.length &&
					noticeFor(
						notice,
						member.children.map((child) => list!.membersByEmail.get(child) ?? { email: child, orchestras: [] }),
						takesPart
					)
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
