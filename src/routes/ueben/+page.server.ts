import { error } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { parseInstruments } from '#lib/music/my-parts.ts';
import { totalSeconds } from '#lib/practice/practice.ts';
import { getStore } from '#lib/server/db/index.ts';
import { isOn } from '#lib/server/env.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import { boardFor, sharingState } from '#lib/server/drills.ts';
import type { PageServerLoad } from './$types';

/**
 * The Übebereich (#300, #315): drills that run in the browser. The server only says whose
 * progress to load from the device, which instruments the member plays (so the drills start in
 * the right clef) and whether their time counts for the practice tree; answers, progress and the
 * microphone never reach it. Besides, what the member chose to share (a summary per day, see
 * sharing.ts) and, when they're on it, this week's board.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!isOn('drills')) error(404, t.error.notFound);
	const user = locals.access.user;
	const signedIn = locals.auth === 'on' && !!user && !!locals.access.member;
	const email = user ? normalizeEmail(user.email) : null;
	const [access, practising] = await Promise.all([
		user ? getAccessList().catch(() => null) : null,
		signedIn && email ? getStore().practiceOn(email).catch(() => false) : false
	]);
	const member = email ? access?.membersByEmail.get(email) : undefined;
	// The practice tree's total, shown on the page: only the member's own, and only with practice time on.
	const treeSeconds = signedIn && email && practising ? await getStore().practiceOf(email).then(totalSeconds, () => null) : null;
	const state = signedIn && email && access && !locals.access.parent?.only ? await sharingState(access, email).catch(() => null) : null;
	const board = state && email && access ? await boardFor(access, email, state).catch(() => null) : null;
	// Drills an administrator opened for this member (#327), on top of what their progress opens.
	const granted = email && locals.access.member ? await getStore().drillUnlocksOf(email).catch(() => []) : [];
	return {
		// Progress is kept per account on the device, so a shared device keeps each member's own.
		account: email ?? 'guest',
		instruments: parseInstruments(member?.instrument ?? '', config).map((choice) => choice.instrument),
		// Time in the rounds goes to practice time (the tree) only when the member records it; null without an account.
		practising: signedIn ? practising : null,
		treeSeconds,
		// Null without an account: sharing needs someone signed in.
		sharing: state ? { chosen: state.chosen, effective: state.effective, child: state.child, consented: state.consented } : null,
		board,
		granted
	};
};
