import { error } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { drillsAccessList, leaderOverview } from '#lib/server/drills.ts';
import { isOn } from '#lib/server/env.ts';
import type { PageServerLoad } from './$types';

/**
 * The leaders' view of the Übebereich (#300): for the conductor and teachers ("ueben.begleiten"),
 * the summaries of the members who chose to share them, in the orchestras the right holds for.
 * Members who don't share aren't listed at all, not even as "not sharing".
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!isOn('drills') || locals.auth !== 'on' || !locals.access.rights.has('ueben.begleiten')) error(404, t.error.notFound);
	const list = await drillsAccessList();
	if (!list) error(503, t.error.unavailable);
	return { members: await leaderOverview(locals.access, list) };
};
