import { error, fail, redirect } from '@sveltejs/kit';
import { albumDay, albumHref, albumKey, cleanText, FIRST_YEAR, TITLE_MAX } from '#lib/album/album.ts';
import * as t from '#lib/i18n/texts.ts';
import { albumChoices, albumStore, albumViewer } from '#lib/server/album.ts';
import { today } from '#lib/server/members.ts';
import { requireFeature } from '#lib/server/env.ts';
import type { Actions, PageServerLoad } from './$types';

/** What photos can be added to (#66): every past concert back to the founding, recent dates, trips, own albums. */
export const load: PageServerLoad = async ({ locals }) => {
	requireFeature('album');
	if (!(await albumViewer(locals))) error(403, t.album.membersOnly);
	const store = await albumStore();
	if (!store) return { state: 'not-set-up' as const };
	return { state: 'ready' as const, choices: (await albumChoices(store)).map((choice) => ({ ...choice, href: albumHref(choice.key) })), firstYear: FIRST_YEAR, thisYear: Number(today().slice(0, 4)) };
};

export const actions: Actions = {
	/** An album of its own, for what's in neither the calendar nor the archive; then straight to it. */
	create: async ({ request, locals }) => {
		const viewer = await albumViewer(locals);
		if (!viewer) error(403, t.album.membersOnly);
		const store = await albumStore();
		if (!store) return fail(503, { message: t.album.notSetUp });
		const data = await request.formData();
		const values = { title: String(data.get('title') ?? ''), year: String(data.get('year') ?? ''), month: String(data.get('month') ?? ''), day: String(data.get('day') ?? '') };
		const title = cleanText(values.title, TITLE_MAX);
		if (!title || title.includes('\n')) return fail(400, { message: t.album.pick.badName(TITLE_MAX), values });
		const day = albumDay(values.year, values.month, values.day, today());
		if (!day) return fail(400, { message: t.album.pick.badDate(FIRST_YEAR), values });
		let id: string;
		try {
			id = (await store.addOwnAlbum({ title, day, email: viewer.email })).id;
		} catch (cause) {
			console.error('Creating an album failed:', cause);
			return fail(503, { message: t.album.problems.failed, values });
		}
		redirect(303, albumHref(albumKey('album', id)));
	}
};
