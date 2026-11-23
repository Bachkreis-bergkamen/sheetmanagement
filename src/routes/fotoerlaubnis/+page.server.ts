import { error } from '@sveltejs/kit';
import { currentStatus, isAdminOnly } from '#lib/access/access.ts';
import * as t from '#lib/i18n/texts.ts';
import { answerOf, byAnswer } from '#lib/parents/photos.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { today } from '#lib/server/members.ts';
import { photoConsents } from '#lib/server/photos.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { PageServerLoad } from './$types';

/**
 * Who may appear in the orchestra's photos and videos (#299), for those who see the sign-ups:
 * whoever takes or posts the pictures checks here, or on a date's page for that date.
 */
export const load: PageServerLoad = async ({ locals }) => {
	requireRight(locals, 'anmeldungen.sehen');
	if (locals.auth !== 'on') error(404, t.error.notFound);
	const [list, consents] = await Promise.all([getAccessList().catch(() => null), photoConsents()]);
	if (!list) error(503, t.error.unavailable);
	const day = today();
	const players = byAnswer(
		list.members
			.filter((member) => !isAdminOnly(member) && currentStatus(member, day) !== 'inaktiv')
			.map((member) => {
				const consent = consents.get(member.email);
				return { name: member.name, answer: answerOf(consent), byParent: !!consent && consent.by !== member.email };
			})
	);
	return {
		groups: (['no', 'open', 'yes'] as const).map((answer) => ({ answer, players: players.filter((player) => player.answer === answer) }))
	};
};
