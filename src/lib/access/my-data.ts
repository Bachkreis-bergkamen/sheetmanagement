import { normalizeEmail } from '#lib/access/access.ts';
import { parseVotes, submitterEmail } from '#lib/feedback/feedback.ts';
import { t } from '#lib/i18n/index.ts';
import { LAYOUT, normalize, type Table, type TabKey } from '#lib/repertoire/sheet.ts';
import type { Poll, PollResponse } from '#lib/polls/polls.ts';
import type { PageMarks, PracticeDay, PushDevice, SentReminder, TourOutcome } from '#lib/server/db/types.ts';

/**
 * "Meine Daten herunterladen" (#158): everything the sheet keeps about one member, row by
 * row, with the sheet's own column names, so a request for access (Art. 15 GDPR) is answered
 * from the profile. Other people's data in the same rows stays out: of a wish, only whether
 * the member gave it a +1, not who else did, nor who made it if that was someone else.
 */

/** The tabs that hold rows about people, and how a row is recognised as the member's. */
type Owner = (values: Record<string, string>, who: { email: string; name: string }) => boolean;
const byEmail =
	(column: string): Owner =>
	(values, who) =>
		normalizeEmail(values[column] ?? '') === who.email;
const byName =
	(column: string): Owner =>
	(values, who) =>
		!!who.name && normalize(values[column] ?? '') === normalize(who.name);

const OWNERS: Partial<Record<TabKey, Owner>> = {
	members: byEmail('email'),
	requests: byEmail('email'),
	signups: byEmail('who'),
	attendance: byEmail('who'),
	reports: (values, who) => submitterEmail(values.reportedBy ?? '') === who.email,
	wishes: (values, who) => submitterEmail(values.submittedBy ?? '') === who.email || parseVotes(values.votes ?? '').includes(who.email),
	pieceNotes: byName('by'),
	missingParts: byEmail('assignee'),
	partAssignments: (values, who) => byEmail('who')(values, who) || byName('by')(values, who),
	rehearsalNotes: byName('by')
};

export type MyData = Record<string, Record<string, string>[]>;

/**
 * The member's rows per tab, by the tab's name; tabs without any are left out. `tables` are
 * the tabs as read; a missing tab has nothing to give.
 */
export function myData(who: { email: string; name: string }, tables: Partial<Record<TabKey, Table<string>>>): MyData {
	const me = { email: normalizeEmail(who.email), name: who.name.trim() };
	const data: MyData = {};
	for (const [key, owns] of Object.entries(OWNERS) as [TabKey, Owner][]) {
		const table = tables[key];
		if (!table) continue;
		const columns = LAYOUT[key].columns as Record<string, string>;
		const rows = table.rows
			.filter((row) => owns(row.values, me))
			.map((row) => {
				const out: Record<string, string> = {};
				for (const [column, value] of Object.entries(row.values)) {
					if (key === 'wishes' && column === 'votes') continue;
					// A wish someone else made: who made it is theirs, as on the wishes page.
					if (key === 'wishes' && column === 'submittedBy' && submitterEmail(value) !== me.email) continue;
					if (value && columns[column]) out[columns[column]] = value;
				}
				// Who else gave a +1 is theirs; only the member's own +1 belongs here.
				if (key === 'wishes') out[t.myData.myVote] = parseVotes(row.values.votes ?? '').includes(me.email) ? t.myData.yes : t.myData.no;
				return out;
			});
		if (rows.length) data[LAYOUT[key].tab] = rows;
	}
	return data;
}

/**
 * What the app keeps about the member in D1 (#161): their devices for notifications and the
 * reminders they got. A device's keys only encrypt messages to it; they're named, not given.
 */
export function storedData(
	devices: Pick<PushDevice, 'endpoint' | 'createdAt'>[],
	reminders: SentReminder[],
	mailOff = false,
	tour: TourOutcome | null = null,
	practice: { on: boolean; days: PracticeDay[] } = { on: false, days: [] },
	marks: PageMarks[] = []
): MyData {
	const data: MyData = {};
	if (devices.length) {
		data[t.myData.devices] = devices.map((device) => ({
			[t.myData.pushService]: new URL(device.endpoint).host,
			[t.myData.since]: device.createdAt ?? '',
			[t.myData.keys]: t.myData.keysStored
		}));
	}
	if (reminders.length) {
		data[t.myData.reminders] = reminders.map((reminder) => ({
			[t.myData.reminderKind]: t.myData.reminderKinds[reminder.kind] ?? reminder.kind,
			// Loans are "piece|return date".
			[t.myData.reminderAbout]: reminder.subject.replaceAll('|', ', '),
			[t.myData.sentAt]: reminder.sentAt
		}));
	}
	// Turned off on /profil (#123); "on" is the default and nothing is stored for it.
	if (mailOff) data[t.myData.mailReminders] = [{ [t.myData.mailState]: t.myData.mailOff }];
	// So the tour isn't offered again; nothing is stored before it's finished or skipped.
	if (tour) data[t.myData.tour] = [{ [t.myData.mailState]: tour === 'done' ? t.myData.tourDone : t.myData.tourSkipped }];
	// Practice time: off unless the member turned it on, and nothing is stored before.
	if (practice.on || practice.days.length) {
		data[t.practice.data] = [
			{ [t.practice.dataOn]: practice.on ? t.myData.yes : t.myData.no },
			...practice.days.map((day) => ({ [t.practice.dataDay]: day.day, [t.practice.dataMinutes]: String(Math.round(day.seconds / 60)) }))
		];
	}
	// Pen marks in the practice viewer, per page, with the strokes themselves.
	if (marks.length) {
		data[t.practice.dataMarks] = marks.map((page) => ({
			[t.practice.dataFile]: page.file,
			[t.practice.dataPage]: String(page.page),
			[t.practice.dataStrokes]: JSON.stringify(page.strokes)
		}));
	}
	return data;
}

/** The member's answers in date polls (#95), one row per date they answered. */
export function pollData(answers: { poll: Poll; response: PollResponse }[]): MyData {
	const rows = answers.flatMap(({ poll, response }) =>
		poll.options
			.filter((option) => response.choices[option.id])
			.map((option) => ({
				[t.myData.poll]: poll.title,
				[t.myData.pollDate]: [option.until ? `${option.date}–${option.until}` : option.date, option.start && `${option.start}${option.end ? `–${option.end}` : ''}`].filter(Boolean).join(' '),
				[t.myData.pollAnswer]: t.polls.answer[response.choices[option.id]],
				[t.myData.pollComment]: response.comment ?? '',
				[t.myData.pollAnsweredAt]: response.updatedAt
			}))
	);
	return rows.length ? { [t.myData.polls]: rows } : {};
}

/** A file name without characters that trouble file systems: "meine-daten-mia-example-org.json". */
export function exportFileName(email: string): string {
	return `${t.myData.fileName}-${normalizeEmail(email).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.json`;
}
