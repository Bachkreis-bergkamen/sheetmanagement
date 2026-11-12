import { describe, expect, it } from 'vitest';
import {
	canSeeInside,
	canSeeTrip,
	formatDays,
	movesUp,
	nowAndNext,
	overview,
	placeFor,
	planByDay,
	planItemFromForm,
	selfRoles,
	isYoung,
	signupFromForm,
	signupOpen,
	slugFor,
	tripDays,
	tripFromForm,
	type Participant,
	type PlanItem,
	type Trip,
	type TripViewer
} from './trips.ts';

const form = (entries: [string, string][]) => {
	const data = new FormData();
	for (const [key, value] of entries) data.append(key, value);
	return data;
};

const trip: Trip = {
	id: 't1',
	slug: 'italienreise-2027',
	title: 'Italienreise 2027',
	kind: 'konzertfahrt',
	firstDay: '2027-05-01',
	lastDay: '2027-05-04',
	orchestras: ['A'],
	organisers: ['orga@x.org'],
	stops: [
		{ place: 'Florenz', from: '2027-05-01', until: '2027-05-02' },
		{ place: 'Rom', from: '2027-05-03', until: '2027-05-04' }
	],
	cap: 2,
	lists: ['instrumente', 'ernaehrung', 'notfall', 'einverstaendnis'],
	questions: [],
	eventIds: [],
	createdBy: 'orga@x.org',
	createdAt: '2026-11-01T00:00:00Z'
};

const person = (email: string, status: Participant['status'], signedUpAt: string, extra: Partial<Participant> = {}): Participant => ({
	tripId: 't1',
	email,
	name: email.split('@')[0],
	roles: ['musiker'],
	status,
	signedUpAt,
	...extra
});

const viewer = (extra: Partial<TripViewer> = {}): TripViewer => ({ email: 'mia@x.org', orchestras: ['A'], edits: false, children: [], ...extra });

describe('tripFromForm', () => {
	it('reads a trip with its stops, sorted, and every orchestra ticked as none', () => {
		const result = tripFromForm(
			form([
				['title', '  Italienreise   2027 '],
				['kind', 'konzertfahrt'],
				['firstDay', '2027-05-01'],
				['lastDay', '2027-05-04'],
				['orchestra', 'A'],
				['orchestra', 'B'],
				['stopPlace', 'Rom'],
				['stopFrom', '2027-05-03'],
				['stopUntil', ''],
				['stopPlace', 'Florenz'],
				['stopFrom', ''],
				['stopUntil', '2027-05-02'],
				['stopPlace', ''],
				['stopFrom', ''],
				['stopUntil', ''],
				['cap', '40'],
				['signupUntil', '2027-03-31'],
				['organisers', 'Tim@X.org, nonsense; ida@x.org'],
				['list', 'notfall'],
				['list', 'ernaehrung'],
				['list', 'unbekannt'],
				['questionId', ''],
				['questionText', 'Notenständer?'],
				['questionType', 'janein'],
				['questionOptions', ''],
				['pictureSearch', 'Dom von Florenz']
			]),
			{ orchestras: ['A', 'B'], newId: () => 'q1' }
		);
		expect(result).toEqual({
			trip: {
				title: 'Italienreise 2027',
				kind: 'konzertfahrt',
				firstDay: '2027-05-01',
				lastDay: '2027-05-04',
				orchestras: [],
				organisers: ['tim@x.org', 'ida@x.org'],
				stops: [
					{ place: 'Florenz', from: '2027-05-01', until: '2027-05-02' },
					{ place: 'Rom', from: '2027-05-03', until: '2027-05-04' }
				],
				lists: ['ernaehrung', 'notfall'],
				questions: [{ id: 'q1', text: 'Notenständer?', type: 'janein', options: [] }],
				pictureSearch: 'Dom von Florenz',
				signupUntil: '2027-03-31',
				cap: 40
			}
		});
	});

	it('names what is wrong', () => {
		const base: [string, string][] = [
			['title', 'Probenwochenende'],
			['kind', 'probenfahrt'],
			['firstDay', '2027-03-05'],
			['lastDay', '2027-03-07']
		];
		const problem = (extra: [string, string][], drop?: string) =>
			(tripFromForm(form([...base.filter(([key]) => key !== drop), ...extra]), { orchestras: [] }) as { problem?: string }).problem;
		expect(problem([], 'title')).toBe('title');
		expect(problem([['kind', 'urlaub']], 'kind')).toBe('kind');
		expect(problem([['lastDay', '2027-03-01']], 'lastDay')).toBe('order');
		expect(problem([['firstDay', '5.3.2027']], 'firstDay')).toBe('days');
		expect(problem([['stopPlace', 'Haltern'], ['stopFrom', '2027-03-08']])).toBe('stop');
		expect(problem([['cap', '0']])).toBe('cap');
		expect(problem([['signupUntil', '2027-04-01']])).toBe('deadline');
		expect(problem([])).toBeUndefined();
	});
});

describe('slugFor', () => {
	it('makes a readable slug with the year, and a number when taken', () => {
		expect(slugFor('Italienreise 2027', '2027-05-01')).toBe('italienreise-2027');
		expect(slugFor('Probenwochenende Hörsaal', '2027-03-05')).toBe('probenwochenende-hoersaal-2027');
		expect(slugFor('Probenwochenende', '2027-03-05', ['probenwochenende-2027'])).toBe('probenwochenende-2027-2');
		expect(slugFor('!!!', '2027-03-05')).toBe('fahrt-2027');
	});
});

describe('days', () => {
	it('lists every day and formats the range', () => {
		expect(tripDays(trip)).toEqual(['2027-05-01', '2027-05-02', '2027-05-03', '2027-05-04']);
		expect(formatDays('2027-05-01', '2027-05-04', 'de-DE')).toMatch(/1\.\s*[–-]\s*4\. Mai 2027/);
		expect(formatDays('2027-05-01', '2027-05-01', 'de-DE')).toBe('1. Mai 2027');
	});

	it('keeps sign-up open until the deadline, else until the trip starts', () => {
		expect(signupOpen(trip, '2027-05-01')).toBe(true);
		expect(signupOpen(trip, '2027-05-02')).toBe(false);
		expect(signupOpen({ ...trip, signupUntil: '2027-03-31' }, '2027-04-01')).toBe(false);
	});
});

describe('who sees a trip', () => {
	it('shows it to its orchestras, organisers, participants and their parents', () => {
		expect(canSeeTrip(trip, viewer(), [])).toBe(true);
		expect(canSeeTrip(trip, viewer({ orchestras: ['B'] }), [])).toBe(false);
		expect(canSeeTrip(trip, viewer({ orchestras: ['B'], edits: true }), [])).toBe(true);
		expect(canSeeTrip(trip, viewer({ email: 'orga@x.org', orchestras: ['B'] }), [])).toBe(true);
		// A parent account: not invited itself, but sees its child's trip.
		const parent = viewer({ email: 'eltern@x.org', orchestras: [], adminOnly: true, children: ['mia@x.org'] });
		expect(canSeeTrip(trip, parent, [])).toBe(false);
		expect(canSeeTrip(trip, parent, [person('mia@x.org', 'angemeldet', '1')])).toBe(true);
	});

	it('shows the plan and the others only to those signed up, their parents and organisers', () => {
		const participants = [person('mia@x.org', 'angemeldet', '1'), person('jo@x.org', 'warteliste', '2')];
		expect(canSeeInside(trip, viewer(), participants)).toBe(true);
		expect(canSeeInside(trip, viewer({ email: 'jo@x.org' }), participants)).toBe(false);
		expect(canSeeInside(trip, viewer({ email: 'eltern@x.org', children: ['mia@x.org'] }), participants)).toBe(true);
		expect(canSeeInside(trip, viewer({ email: 'x@x.org', edits: true }), [])).toBe(true);
	});
});

describe('places and the waiting list', () => {
	it('gives places until the cap, then the waiting list, which keeps its order', () => {
		const one = [person('a@x.org', 'angemeldet', '1')];
		expect(placeFor(trip, one, 'b@x.org')).toBe('angemeldet');
		const full = [...one, person('b@x.org', 'angemeldet', '2')];
		expect(placeFor(trip, full, 'c@x.org')).toBe('warteliste');
		expect(placeFor(trip, full, 'a@x.org')).toBe('angemeldet');
		// A place frees up, but someone waits: a new sign-up queues behind them.
		const freed = [one[0], person('c@x.org', 'warteliste', '3')];
		expect(placeFor(trip, freed, 'd@x.org')).toBe('warteliste');
		expect(movesUp(trip, freed).map((p) => p.email)).toEqual(['c@x.org']);
		expect(placeFor({ ...trip, cap: undefined }, full, 'z@x.org')).toBe('angemeldet');
	});

	it('moves up as many as there are free places, first come first', () => {
		const participants = [person('w2@x.org', 'warteliste', '5'), person('w1@x.org', 'warteliste', '4'), person('w3@x.org', 'warteliste', '6')];
		expect(movesUp(trip, participants).map((p) => p.email)).toEqual(['w1@x.org', 'w2@x.org']);
		expect(movesUp(trip, [person('a@x.org', 'angemeldet', '1'), person('b@x.org', 'angemeldet', '2'), ...participants])).toEqual([]);
	});

	it('counts for the organisers who comes, who waits for a parent and who has not answered', () => {
		const participants = [
			person('mia@x.org', 'angemeldet', '1', { roles: ['musiker'] }),
			person('tim@x.org', 'angemeldet', '2', { roles: ['betreuer', 'musiker'] }),
			person('jo@x.org', 'warteliste', '3'),
			person('lea@x.org', 'abgemeldet', '4')
		];
		const result = overview(
			participants,
			[
				{ email: 'mia@x.org', name: 'Mia' },
				{ email: 'paul@x.org', name: 'Paul' }
			],
			new Set(['mia@x.org'])
		);
		expect(result).toMatchObject({ signedUp: 2, waiting: 1, cancelled: 1, unanswered: ['Paul'], awaitingParent: ['mia'] });
		// Tim plays and looks after the group: he counts in both.
		expect(result.byRole).toMatchObject({ musiker: 2, betreuer: 1, fahrer: 0 });
	});
});

describe('signupFromForm', () => {
	it('keeps only arrival and departure that differ from the trip, within it', () => {
		expect(signupFromForm(form([['role', 'dirigent'], ['role', 'betreuer'], ['role', 'musiker'], ['arrival', '2027-05-01'], ['departure', '2027-05-03'], ['note', ' vegetarisch ']]), trip)).toEqual({
			roles: ['musiker', 'betreuer', 'dirigent'],
			departure: '2027-05-03',
			note: 'vegetarisch'
		});
		expect(signupFromForm(form([['role', 'koch']]), trip)).toEqual({ problem: 'role' });
		expect(signupFromForm(form([['role', 'musiker'], ['role', 'koch']]), trip)).toEqual({ problem: 'role' });
		expect(signupFromForm(form([]), trip)).toEqual({ problem: 'role' });
	});

	it('lets young members come along as Musiker·in only (#299)', () => {
		expect(signupFromForm(form([['role', 'musiker'], ['role', 'betreuer']]), trip, { minor: true })).toEqual({ problem: 'young' });
		expect(signupFromForm(form([['role', 'dirigent']]), trip, { minor: true })).toEqual({ problem: 'young' });
		expect(signupFromForm(form([['role', 'musiker']]), trip, { minor: true })).toEqual({ roles: ['musiker'] });
		expect(selfRoles(true)).toEqual(['musiker']);
		expect(signupFromForm(form([['role', 'musiker'], ['arrival', '2027-05-02']]), trip, { minor: true })).toEqual({ problem: 'young-days' });
		expect(signupFromForm(form([['role', 'musiker'], ['departure', '2027-05-03']]), trip, { minor: true })).toEqual({ problem: 'young-days' });
		// The trip's own days say nothing more.
		expect(signupFromForm(form([['role', 'musiker'], ['arrival', '2027-05-01'], ['departure', '2027-05-04']]), trip, { minor: true })).toEqual({ roles: ['musiker'] });
	});

	it('counts someone’s child as young, and a member of none of the adult orchestras', () => {
		const children = new Set(['kid@x.org']);
		expect(isYoung({ email: 'kid@x.org', orchestras: ['EO'] }, children, ['EO'])).toBe(true);
		expect(isYoung({ email: 'a@x.org', orchestras: ['A'] }, children, ['EO'])).toBe(true);
		expect(isYoung({ email: 'e@x.org', orchestras: ['A', 'eo'] }, children, ['EO'])).toBe(false);
		// Parents and helpers play in no orchestra.
		expect(isYoung({ email: 'p@x.org', orchestras: [] }, children, ['EO'])).toBe(false);
		// Without adult orchestras, only children count.
		expect(isYoung({ email: 'a@x.org', orchestras: ['A'] }, children)).toBe(false);
		expect(selfRoles(false)).toContain('betreuer');
		expect(signupFromForm(form([['role', 'gast'], ['arrival', '2027-05-09']]), trip)).toEqual({ problem: 'days' });
		expect(signupFromForm(form([['role', 'gast'], ['arrival', '2027-05-03'], ['departure', '2027-05-02']]), trip)).toEqual({ problem: 'days' });
	});
});

describe('the plan', () => {
	const item = (id: string, day: string, start?: string, end?: string): PlanItem => ({ id, tripId: 't1', day, title: id, kind: 'tutti', ...(start ? { start } : {}), ...(end ? { end } : {}) });

	it('reads an item and checks its day and times', () => {
		const base: [string, string][] = [
			['title', 'Registerprobe'],
			['kind', 'register'],
			['day', '2027-05-02']
		];
		expect(planItemFromForm(form([...base, ['start', '09:30'], ['end', '12:00'], ['audience', 'Streicher']]), trip)).toEqual({
			item: { day: '2027-05-02', title: 'Registerprobe', kind: 'register', start: '09:30', end: '12:00', audience: 'Streicher' }
		});
		expect(planItemFromForm(form([...base, ['end', '12:00']]), trip)).toEqual({ problem: 'time' });
		expect(planItemFromForm(form([...base, ['start', '12:00'], ['end', '09:00']]), trip)).toEqual({ problem: 'end' });
		expect(planItemFromForm(form([['title', 'x'], ['day', '2027-06-01']]), trip)).toEqual({ problem: 'day' });
	});

	it('groups items and attached dates by day, by time, with the day’s places', () => {
		const days = planByDay(trip, [item('lunch', '2027-05-02', '12:30'), item('free', '2027-05-02'), item('tutti', '2027-05-02', '09:30')], [
			{ id: 'e1', day: '2027-05-02', start: '19:00', end: '21:00', title: 'Konzert Florenz', type: 'konzert' }
		]);
		expect(days.map((day) => day.day)).toEqual(tripDays(trip));
		expect(days[1].places).toEqual(['Florenz']);
		expect(days[2].places).toEqual(['Rom']);
		expect(days[1].entries.map((entry) => entry.item?.id ?? entry.event?.id)).toEqual(['free', 'tutti', 'lunch', 'e1']);
	});

	it('knows what is on now and next; an item without end lasts until the next', () => {
		const [day] = planByDay({ ...trip, lastDay: trip.firstDay }, [item('breakfast', '2027-05-01', '08:00'), item('rehearsal', '2027-05-01', '09:30', '12:00'), item('lunch', '2027-05-01', '12:30')]);
		expect(nowAndNext(day, '08:45').now.map((entry) => entry.item?.id)).toEqual(['breakfast']);
		expect(nowAndNext(day, '08:45').next?.item?.id).toBe('rehearsal');
		expect(nowAndNext(day, '12:10').now).toEqual([]);
		expect(nowAndNext(day, '12:10').next?.item?.id).toBe('lunch');
		expect(nowAndNext(day, '23:00')).toMatchObject({ now: [{ item: { id: 'lunch' } }], next: undefined });
		expect(nowAndNext(undefined, '10:00')).toEqual({ now: [], next: undefined });
	});
});
