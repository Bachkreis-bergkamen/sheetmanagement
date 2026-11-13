import { describe, expect, it } from 'vitest';
import {
	canReadList,
	instrumentFromForm,
	instrumentsOnTrip,
	kitchen,
	listFromForm,
	listProgress,
	listsDue,
	listsFor,
	listsGoneOn,
	looksBulky,
	questionsFromForm,
	tripLists,
	type Instrument,
	type ListEntry,
	type Question
} from './lists.ts';
import type { Participant } from './trips.ts';

const form = (entries: [string, string][]) => {
	const data = new FormData();
	for (const [key, value] of entries) data.append(key, value);
	return data;
};

const person = (email: string, name: string, extra: Partial<Participant> = {}): Participant => ({ tripId: 't1', email, name, roles: ['musiker'], status: 'angemeldet', signedUpAt: '1', ...extra });
const entry = <K extends ListEntry['kind']>(email: string, kind: K, data: ListEntry<K>['data'], savedBy = email): ListEntry => ({ tripId: 't1', email, kind, data, savedAt: '2027-01-01T10:00:00Z', savedBy });

describe('which lists a trip asks for', () => {
	it('keeps the lists in their order, with the questions when there are some, and instruments only for those who play', () => {
		const trip = { lists: ['notfall' as const, 'instrumente' as const], questions: [] };
		expect(tripLists(trip)).toEqual(['instrumente', 'notfall']);
		expect(tripLists({ ...trip, questions: [{ id: 'q', text: 'Größe?', type: 'text', options: [] }] })).toEqual(['instrumente', 'notfall', 'fragen']);
		expect(listsFor(trip, ['gast'])).toEqual(['notfall']);
		expect(listsFor(trip, ['betreuer'])).toEqual(['notfall']);
		// A carer who also plays brings an instrument.
		expect(listsFor(trip, ['betreuer', 'musiker'])).toEqual(['instrumente', 'notfall']);
		expect(listsFor(trip, ['dirigent'])).toEqual(['instrumente', 'notfall']);
	});

	it('lets the Betreuer·innen read only what they need on the trip', () => {
		expect(canReadList('ernaehrung', { organises: false, carer: true })).toBe(true);
		expect(canReadList('notfall', { organises: false, carer: true })).toBe(true);
		expect(canReadList('instrumente', { organises: false, carer: true })).toBe(false);
		expect(canReadList('wuensche', { organises: false, carer: false })).toBe(false);
		expect(canReadList('wuensche', { organises: true, carer: false })).toBe(true);
	});
});

describe('the forms of the lists', () => {
	it('takes diet and allergies only with the consent of Art. 9 DSGVO', () => {
		const filled: [string, string][] = [
			['diet', 'vegan'],
			['allergy', 'Erdnüsse'],
			['severity', 'schwer'],
			['allergy', ' '],
			['severity', 'leicht'],
			['medication', 'EpiPen im Rucksack']
		];
		expect(listFromForm('ernaehrung', form(filled))).toEqual({ problem: 'consent' });
		expect(listFromForm('ernaehrung', form([...filled, ['consent', 'on']]))).toEqual({
			data: { diet: 'vegan', allergies: [{ what: 'Erdnüsse', severity: 'schwer' }], medication: 'EpiPen im Rucksack' }
		});
		expect(listFromForm('ernaehrung', form([['diet', 'paleo'], ['consent', 'on']]))).toEqual({ problem: 'diet' });
	});

	it('wants a name and a phone number for the emergency contact', () => {
		expect(listFromForm('notfall', form([['name', 'Maria'], ['phone', '']]))).toEqual({ problem: 'emergency' });
		expect(listFromForm('notfall', form([['name', 'Maria'], ['phone', 'ruf an']]))).toEqual({ problem: 'phone' });
		expect(listFromForm('notfall', form([['name', 'Maria'], ['phone', '+49 170 123456'], ['insurance', '']]))).toEqual({ data: { name: 'Maria', phone: '+49 170 123456' } });
	});

	it('asks young players about free time, and takes only their own instruments along', () => {
		expect(listFromForm('einverstaendnis', form([['photos', 'ja'], ['travelAlone', 'nein'], ['freeTime', 'ja']]))).toEqual({ data: { photos: true, travelAlone: false } });
		expect(listFromForm('einverstaendnis', form([['photos', 'nein'], ['travelAlone', 'ja'], ['freeTime', 'ja']]), { minor: true })).toEqual({ data: { photos: false, travelAlone: true, freeTime: true } });
		expect(listFromForm('instrumente', form([['taken', 'a'], ['taken', 'b'], ['taken', 'a']]), { instruments: [{ id: 'a' }] })).toEqual({ data: { taken: ['a'] } });
		expect(listFromForm('dokumente', form([['validId', 'ja']]))).toEqual({ data: { validId: true } });
	});

	it('checks the answers to the trip’s own questions', () => {
		const questions: Question[] = [
			{ id: 'size', text: 'T-Shirt', type: 'auswahl', options: ['S', 'M'] },
			{ id: 'stand', text: 'Notenständer?', type: 'janein', options: [] },
			{ id: 'free', text: 'Sonst?', type: 'text', options: [] }
		];
		expect(listFromForm('fragen', form([['q-size', 'M'], ['q-stand', 'ja'], ['q-free', '']]), { questions })).toEqual({ data: { size: 'M', stand: 'ja' } });
		expect(listFromForm('fragen', form([['q-size', 'XXL']]), { questions })).toEqual({ problem: 'choice' });
		expect(listFromForm('fragen', form([['q-stand', 'vielleicht']]), { questions })).toEqual({ problem: 'answer' });
	});

	it('reads an instrument, its value in whole euros as people write it', () => {
		expect(instrumentFromForm(form([['name', 'Violoncello'], ['owner', 'orchester'], ['insurance', 'gruppe'], ['value', '6.800 €'], ['bulky', 'on']]))).toEqual({
			instrument: { name: 'Violoncello', owner: 'orchester', insurance: 'gruppe', value: 6800, bulky: true }
		});
		expect(instrumentFromForm(form([['name', 'Geige'], ['value', '1200,50']]))).toMatchObject({ instrument: { value: 1200, owner: 'eigen', insurance: 'keine', bulky: false } });
		expect(instrumentFromForm(form([['name', 'Geige'], ['value', 'viel']]))).toEqual({ problem: 'value' });
		expect(instrumentFromForm(form([['name', '']]))).toEqual({ problem: 'instrument' });
		expect([looksBulky('Kontrabass'), looksBulky('Violoncello'), looksBulky('Pauken'), looksBulky('Geige'), looksBulky('Bassklarinette')]).toEqual([true, true, true, false, false]);
	});

	it('keeps a question’s id when it’s edited, and makes a choice without choices a text question', () => {
		let n = 0;
		const questions = questionsFromForm(
			form([
				['questionId', 'q1'],
				['questionText', 'T-Shirt-Größe'],
				['questionType', 'auswahl'],
				['questionOptions', 'S, M, M, L'],
				['questionId', ''],
				['questionText', 'Was noch?'],
				['questionType', 'auswahl'],
				['questionOptions', ''],
				['questionId', ''],
				['questionText', ''],
				['questionType', 'text'],
				['questionOptions', '']
			]),
			() => `new${++n}`
		);
		expect(questions).toEqual([
			{ id: 'q1', text: 'T-Shirt-Größe', type: 'auswahl', options: ['S', 'M', 'L'] },
			{ id: 'new1', text: 'Was noch?', type: 'text', options: [] }
		]);
	});
});

describe('the organisers’ views', () => {
	const people = [person('a@x.org', 'Anna'), person('kid@x.org', 'Kid'), person('gast@x.org', 'Gerd', { roles: ['gast'] }), person('wait@x.org', 'Wanda', { status: 'warteliste' })];

	it('says who still has to fill in what; a young player’s consents count once a parent saved them', () => {
		const trip = { lists: ['instrumente' as const, 'einverstaendnis' as const], questions: [] };
		const entries = [entry('a@x.org', 'einverstaendnis', { photos: true, travelAlone: true }), entry('kid@x.org', 'einverstaendnis', { photos: true, travelAlone: false }), entry('a@x.org', 'instrumente', { taken: [] })];
		expect(listProgress(trip, people, entries, new Set(['kid@x.org']))).toEqual([
			{ kind: 'instrumente', filled: 1, of: 2, missing: ['Kid'] },
			{ kind: 'einverstaendnis', filled: 1, of: 3, missing: ['Kid', 'Gerd'] }
		]);
		const byParent = [...entries.slice(0, 1), entry('kid@x.org', 'einverstaendnis', { photos: true, travelAlone: false }, 'mum@x.org')];
		expect(listProgress(trip, people, byParent, new Set(['kid@x.org']))[1].missing).toEqual(['Gerd']);
	});

	it('gives the kitchen counts without names, and names only for severe allergies and notes', () => {
		const summary = kitchen(people, [
			entry('a@x.org', 'ernaehrung', { diet: 'vegan', allergies: [{ what: 'Erdnüsse', severity: 'schwer' }] }),
			entry('kid@x.org', 'ernaehrung', { diet: 'vegan', allergies: [{ what: 'erdnüsse ', severity: 'schwer' }, { what: 'Laktose', severity: 'leicht' }] }),
			entry('gast@x.org', 'ernaehrung', { diet: 'alles', allergies: [], dietNote: 'Kein Schwein' }),
			// On the waiting list: not cooked for yet.
			entry('wait@x.org', 'ernaehrung', { diet: 'halal', allergies: [] })
		]);
		expect(summary.people).toBe(3);
		expect(summary.diets).toEqual([
			{ diet: 'alles', count: 1 },
			{ diet: 'vegan', count: 2 }
		]);
		expect(summary.allergies).toEqual([
			{ what: 'Erdnüsse', severity: 'schwer', count: 2 },
			{ what: 'Laktose', severity: 'leicht', count: 1 }
		]);
		expect(summary.named.map((one) => one.name)).toEqual(['Anna', 'Gerd', 'Kid']);
		expect(kitchen(people, []).diets).toEqual([{ diet: 'unbekannt', count: 3 }]);
	});

	it('lists the instruments coming along with their total, only each person’s own', () => {
		const instruments: Instrument[] = [
			{ id: 'cello', email: 'a@x.org', name: 'Violoncello', owner: 'eigen', value: 6000, insurance: 'gruppe', bulky: true },
			{ id: 'flute', email: 'a@x.org', name: 'Flöte', owner: 'eigen', insurance: 'keine', bulky: false },
			{ id: 'violin', email: 'kid@x.org', name: 'Geige', owner: 'leihe', value: 900, insurance: 'gruppe', bulky: false }
		];
		const result = instrumentsOnTrip(
			people,
			[entry('a@x.org', 'instrumente', { taken: ['cello', 'flute'] }), entry('kid@x.org', 'instrumente', { taken: ['violin', 'cello'] })],
			instruments
		);
		expect(result.rows.map((row) => [row.person, row.instrument.name])).toEqual([
			['Anna', 'Flöte'],
			['Anna', 'Violoncello'],
			['Kid', 'Geige']
		]);
		expect(result.total).toBe(6900);
		expect(result.bulky.map((row) => row.instrument.id)).toEqual(['cello']);
	});

	it('lets the lists go four weeks after the trip', () => {
		const trips = [
			{ id: 'old', lastDay: '2027-01-02' },
			{ id: 'recent', lastDay: '2027-01-10' }
		];
		expect(listsDue(trips, '2027-02-01').map((trip) => trip.id)).toEqual(['old']);
		expect(listsDue(trips, '2027-02-07').map((trip) => trip.id)).toEqual(['old']);
		expect(listsDue(trips, '2027-02-08').map((trip) => trip.id)).toEqual(['old', 'recent']);
		expect(listsGoneOn({ lastDay: '2027-01-10' })).toBe('2027-02-08');
	});
});
