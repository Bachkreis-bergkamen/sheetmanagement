import { redirect } from '@sveltejs/kit';
import { exportFileName, lendingData, myData, pollData, storedData, tripData, tripListData } from '#lib/access/my-data.ts';
import { myInstrumentLoans } from '#lib/server/lending.ts';
import { pollStore } from '#lib/server/polls.ts';
import { tripListsOf, tripStore } from '#lib/server/trips.ts';
import { getStore } from '#lib/server/db/index.ts';
import * as t from '#lib/i18n/texts.ts';
import { orchestra } from '#lib/server/env.ts';
import { getAccessList, getAttendance, getFeedback, getPieceNotes, getRehearsalNotes, getSignups } from '#lib/server/repertoire.ts';
import type { RequestHandler } from './$types';

/** "Meine Daten herunterladen" (#158): the member's own rows from the sheet and from D1, as a JSON file. */
export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.access.user;
	if (locals.auth === 'off' || !user) redirect(303, '/anmelden');
	const email = user.email.trim().toLowerCase();
	const store = getStore();
	const [access, feedback, signups, attendance, pieceNotes, rehearsalNotes, devices, reminders, optOut, tour, practiceOn, practiceDays, marks, polls, drillSharing, drillDays, trips, tripLists, drillProgress, lent] = await Promise.all([
		getAccessList({ force: true }),
		getFeedback(),
		getSignups(),
		getAttendance(),
		getPieceNotes(),
		getRehearsalNotes(),
		store.pushOf(email),
		store.remindersOf(email),
		store.mailOptOuts(),
		store.tourOf(email).catch(() => null),
		store.practiceOn(email).catch(() => false),
		store.practiceOf(email).catch(() => []),
		store.marksOf(email).catch(() => []),
		pollStore()?.answersOf(email).catch(() => []) ?? [],
		store.drillSharing(email).catch(() => null),
		store.drillDaysOf([email], '0000-00-00').catch(() => []),
		tripStore()?.participationsOf(email).catch(() => []) ?? [],
		tripListsOf(email),
		store.drillProgressOf(email).catch(() => null),
		myInstrumentLoans(email)
	]);
	const member = access?.membersByEmail.get(email);
	const data = myData(
		{ email: user.email, name: member?.name || user.name },
		{
			...access?.tables,
			...feedback?.tables,
			signups: signups?.table,
			attendance: attendance?.table,
			pieceNotes: pieceNotes.table,
			rehearsalNotes: rehearsalNotes.table
		}
	);
	const body = {
		orchestra: orchestra().name,
		email: user.email,
		exportedAt: new Date().toISOString(),
		about: t.myData.explain,
		data: { ...data, ...storedData(devices, reminders, optOut.has(email), tour, { on: practiceOn, days: practiceDays }, marks), ...pollData(polls), ...tripData(trips), ...lendingData(lent), ...tripListData(tripLists.lists, tripLists.kept, tripLists.instruments, tripLists.trips, tripLists.arrangements), ...(drillSharing || drillProgress ? { [t.myData.drills]: { ...(drillProgress ? { progress: JSON.parse(drillProgress) } : {}), ...(drillSharing ? { sharing: drillSharing, days: drillDays.map(({ email: _, ...row }) => row) } : {}) } } : {}) }
	};
	return new Response(JSON.stringify(body, null, 2), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="${exportFileName(user.email)}"`,
			'cache-control': 'private, no-store'
		}
	});
};
