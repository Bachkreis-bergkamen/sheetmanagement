import { countingMembers, isAdminOnly, normalizeEmail } from '#lib/access/access.ts';
import { answerOf, byAnswer, mayAnswer, type PhotoConsent } from '#lib/parents/photos.ts';
import type { ShownEvent } from '#lib/events/schedule.ts';
import { getStore } from './db/index.ts';
import { isOn } from './env.ts';
import { getAccessList, getSignups } from './repertoire.ts';

/**
 * Photos and videos of members (#299), see #lib/parents/photos.ts: parents answer on /eltern,
 * everyone else on /profil, and a date's page tells the Leitung whom not to show.
 */

/** Everyone's answers; empty when the database can't be reached, which reads as "nobody agreed". */
export async function photoConsents(): Promise<Map<string, PhotoConsent>> {
	return getStore()
		.photoConsentAll()
		.catch((cause) => {
			console.error('Loading the photo consents failed:', cause);
			return new Map();
		});
}

/** Saves an answer for `member` given by `who`, if `who` may give it; false if not. */
export async function answerPhotos(who: string, member: string, allowed: boolean): Promise<boolean> {
	const list = await getAccessList();
	const email = normalizeEmail(member);
	if (!list?.membersByEmail.has(email) || !mayAnswer(who, email, list.members)) return false;
	await getStore().setPhotoConsent(email, allowed, normalizeEmail(who));
	return true;
}

/**
 * For a date's page: the players of its orchestra who may not be shown, or haven't said, without
 * those excused. Only for those who see the sign-ups, and only before the date.
 */
export async function photosForDate(event: ShownEvent, orchestra: string | undefined, locals: App.Locals, today: string) {
	if (event.past || locals.auth !== 'on' || !locals.access.rights.has('anmeldungen.sehen')) return null;
	const [list, signups, consents] = await Promise.all([
		getAccessList().catch(() => null),
		isOn('signups') ? getSignups().catch(() => null) : null,
		photoConsents()
	]);
	if (!list) return null;
	const excused = new Set((signups?.byEvent.get(event.id) ?? []).filter((signup) => signup.answer === 'no').map((signup) => signup.email));
	const players = countingMembers(list.members, orchestra, today).filter((member) => !isAdminOnly(member) && !excused.has(member.email));
	const answered = players.map((member) => ({ name: member.name, answer: answerOf(consents.get(member.email)) }));
	const notAllowed = byAnswer(answered.filter((player) => player.answer !== 'yes'));
	return { players: players.length, notAllowed, href: '/fotoerlaubnis' };
}

/**
 * For approving photos of a date (#66): its players who may not be shown, or haven't said, by
 * name; those who said they wouldn't come left out. Null when the members can't be read.
 */
export async function notShownAt(event: ShownEvent, orchestra: string | undefined, today: string): Promise<string[] | null> {
	const [list, signups, consents] = await Promise.all([
		getAccessList().catch(() => null),
		isOn('signups') ? getSignups().catch(() => null) : null,
		photoConsents()
	]);
	if (!list) return null;
	const excused = new Set((signups?.byEvent.get(event.id) ?? []).filter((signup) => signup.answer === 'no').map((signup) => signup.email));
	const players = countingMembers(list.members, orchestra, today).filter((member) => !isAdminOnly(member) && !excused.has(member.email));
	return byAnswer(players.map((member) => ({ name: member.name, answer: answerOf(consents.get(member.email)) })).filter((player) => player.answer !== 'yes')).map((player) => player.name);
}
