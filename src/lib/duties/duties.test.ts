import { describe, expect, it } from 'vitest';
import { dutyCounts, eventPlaces, jobFromForm, jobsOf, jobTime, parseTime, placesOf, sortSlots, urgentDuties, type DutySlot, type DutyTake } from './duties.ts';

const form = (values: Record<string, string>) => {
	const data = new FormData();
	for (const [key, value] of Object.entries(values)) data.set(key, value);
	return data;
};

const slot = (id: string, eventId: string, eventDay: string, needed: number, extra: Partial<DutySlot> = {}): DutySlot => ({
	id,
	eventId,
	eventDay,
	eventTitle: eventId,
	task: id,
	needed,
	createdAt: `2026-11-01T10:00:0${id.length}Z`,
	...extra
});

const take = (slotId: string, eventId: string, email: string, at = '2026-11-02T10:00:00Z'): DutyTake => ({ slotId, eventId, email, name: email.split('@')[0], createdAt: at });

describe('the job form', () => {
	it('reads times as people write them', () => {
		expect(['17', '17:30', '17.30', '9:05', '18 Uhr', ''].map(parseTime)).toEqual(['17:00', '17:30', '17:30', '09:05', '18:00', '']);
		expect(['25:00', '17:75', 'abends'].map(parseTime)).toEqual([null, null, null]);
	});

	it('keeps what was filled in and needs one person unless told otherwise', () => {
		expect(jobFromForm(form({ task: ' Aufbau ', from: '17', to: '18.15', needed: '3', note: 'Stühle aus dem Keller' }))).toEqual({
			values: { task: 'Aufbau', from: '17:00', to: '18:15', needed: 3, note: 'Stühle aus dem Keller' }
		});
		expect(jobFromForm(form({ task: 'Kuchen' }))).toEqual({ values: { task: 'Kuchen', needed: 1 } });
	});

	it('refuses a job without a task, unreadable or backwards times, and odd numbers of people', () => {
		expect(jobFromForm(form({ task: ' ' }))).toEqual({ problem: 'task-missing' });
		expect(jobFromForm(form({ task: 'Abbau', from: 'später' }))).toEqual({ problem: 'bad-time' });
		expect(jobFromForm(form({ task: 'Abbau', to: '20:00' }))).toEqual({ problem: 'bad-time' });
		expect(jobFromForm(form({ task: 'Abbau', from: '20:00', to: '19:00' }))).toEqual({ problem: 'to-before-from' });
		for (const needed of ['0', '2.5', '51', 'viele']) expect(jobFromForm(form({ task: 'Abbau', needed }))).toEqual({ problem: 'bad-needed' });
	});

	it('shows the time as a span or a start', () => {
		const from = (time: string) => `ab ${time}`;
		expect([jobTime({ from: '17:00', to: '18:00' }, from), jobTime({ from: '19:00' }, from), jobTime({}, from)]).toEqual(['17:00–18:00', 'ab 19:00', '']);
	});
});

describe('places on the jobs', () => {
	const slots = [slot('aufbau', 'herbst', '2026-12-01', 3, { from: '15:00' }), slot('kasse', 'herbst', '2026-12-01', 2, { from: '16:15' }), slot('kuchen', 'herbst', '2026-12-01', 4)];
	const takes = [take('aufbau', 'herbst', 'mia@example.org'), take('aufbau', 'herbst', 'greta@example.org'), take('kasse', 'herbst', 'vera@example.org')];

	it('counts who is on a job and what is still free', () => {
		expect(placesOf(slots[0], takes)).toMatchObject({ free: 1 });
		expect(placesOf(slots[0], takes).on.map((one) => one.email)).toEqual(['mia@example.org', 'greta@example.org']);
		expect(eventPlaces(slots, takes)).toEqual({ needed: 9, taken: 3, free: 6 });
	});

	it('puts the jobs in the order of the day, untimed ones last', () => {
		expect(sortSlots([slots[2], slots[1], slots[0]]).map((one) => one.id)).toEqual(['aufbau', 'kasse', 'kuchen']);
	});

	it('makes a template of the jobs without the people', () => {
		expect(jobsOf(slots)).toEqual([
			{ task: 'aufbau', from: '15:00', needed: 3 },
			{ task: 'kasse', from: '16:15', needed: 2 },
			{ task: 'kuchen', needed: 4 }
		]);
	});
});

describe('for the organisers', () => {
	const slots = [
		slot('a', 'soon', '2026-11-28', 2),
		slot('b', 'soon', '2026-11-28', 1),
		slot('c', 'full', '2026-11-25', 1),
		slot('d', 'later', '2026-12-20', 3),
		slot('e', 'past', '2026-11-01', 2)
	];
	const takes = [take('a', 'soon', 'mia@example.org'), take('c', 'full', 'mia@example.org'), take('e', 'past', 'greta@example.org'), take('e', 'past', 'mia@example.org')];

	it('lists dates within two weeks that still need people, the nearest first', () => {
		expect(urgentDuties(slots, takes, '2026-11-21')).toEqual([{ eventId: 'soon', eventDay: '2026-11-28', eventTitle: 'soon', free: 2 }]);
	});

	it('counts the jobs per person in a period, the most first', () => {
		expect(dutyCounts(slots, takes, { from: '2026-09-01', to: '2026-11-30' })).toEqual([
			{ email: 'mia@example.org', name: 'mia', count: 3, tasks: ['a', 'c', 'e'] },
			{ email: 'greta@example.org', name: 'greta', count: 1, tasks: ['e'] }
		]);
		expect(dutyCounts(slots, takes, { from: '2026-11-20', to: '2026-11-30' }).map((one) => [one.email, one.count])).toEqual([['mia@example.org', 2]]);
	});
});
