import { describe, expect, it } from 'vitest';
import { eventFormValues, newEventFromForm, newEventTitle, orchestraTitle, type NewEventContext } from './new-event.ts';

const keywords = {
	generalprobe: ['generalprobe'],
	probe: ['probe', 'stimmprobe', 'probentag'],
	konzert: ['konzert', 'auftritt', 'matinee']
};
const herbst = { id: 'h', title: 'Herbstkonzert', start: '2026-11-15T17:00:00+01:00', end: '2026-11-15T19:00:00+01:00', allDay: false };
const weihnacht = { id: 'w', title: 'Weihnachtskonzert (?)', start: '2026-12-20T17:00:00+01:00', end: '2026-12-20T19:00:00+01:00', allDay: false };
const context: NewEventContext = { keywords, timeZone: 'Europe/Berlin', concerts: [herbst, weihnacht] };

const form = (fields: Record<string, string | string[]>) => {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) for (const one of [value].flat()) data.append(name, one);
	return data;
};

describe('newEventTitle', () => {
	it('adds the word that gives the type when the title lacks it', () => {
		expect(newEventTitle('konzert', 'Sommerfest', '2026-07-01', context)).toBe('Konzert Sommerfest');
		expect(newEventTitle('konzert', 'Matinee im Park', '2026-07-01', context)).toBe('Matinee im Park');
		expect(newEventTitle('probe', 'Stimmprobe Bläser', '2026-11-01', context)).toBe('Stimmprobe Bläser');
		expect(newEventTitle('generalprobe', '', '2026-11-14', context)).toBe('Generalprobe');
	});

	it('names the concert a rehearsal prepares for, unless the title already links it', () => {
		expect(newEventTitle('probe', '', '2026-11-01', context, herbst)).toBe('Probe Herbstkonzert');
		expect(newEventTitle('probe', 'Probe Herbstkonzert', '2026-11-01', context, herbst)).toBe('Probe Herbstkonzert');
		// Without the name it would count for the next concert, the Herbstkonzert.
		expect(newEventTitle('probe', 'Probentag', '2026-11-01', context, weihnacht)).toBe('Probentag Weihnachtskonzert');
	});
});

describe('a rehearsal of some of the orchestras', () => {
	const shared: NewEventContext = { ...context, orchestras: ['EO', 'A', 'B'] };

	it('names them in the title, so the calendar says it too', () => {
		expect(newEventTitle('probe', '', '2026-11-01', shared, herbst, 'A')).toBe('Probe Herbstkonzert (A)');
		expect(newEventTitle('generalprobe', '', '2026-11-14', shared, undefined, 'EO, A')).toBe('Generalprobe (EO, A)');
		expect(newEventTitle('probe', 'Probe A', '2026-11-01', shared, undefined, 'A')).toBe('Probe A');
	});

	it('names none when all play together', () => {
		expect(newEventTitle('probe', '', '2026-11-01', shared, herbst, 'EO, A, B')).toBe('Probe Herbstkonzert');
		expect(newEventFromForm(form({ type: 'probe', date: '2026-11-01', concert: 'h', orchestra: '' }), shared)).toMatchObject({ event: { summary: 'Probe Herbstkonzert' } });
	});

	it('takes the choice from the form, and refuses an unknown orchestra', () => {
		expect(newEventFromForm(form({ type: 'probe', date: '2026-11-01', concert: 'h', orchestra: 'a', tentative: 'on' }), shared)).toMatchObject({
			event: { summary: 'Probe Herbstkonzert (A) (?)' }
		});
		expect(newEventFromForm(form({ type: 'probe', date: '2026-11-01', orchestra: 'C' }), shared)).toEqual({ error: 'orchestra' });
		// A concert's orchestras go into the sheet, not its title.
		expect(newEventFromForm(form({ type: 'konzert', title: 'Frühlingskonzert', date: '2027-04-18', orchestra: 'A' }), shared)).toMatchObject({
			event: { summary: 'Frühlingskonzert' }
		});
	});
});

describe('newEventFromForm', () => {
	it('makes a timed concert in the orchestra’s time zone', () => {
		expect(newEventFromForm(form({ type: 'konzert', title: 'Frühlingskonzert', date: '2027-04-18', start: '17:00', end: '19:00', location: 'Aula' }), context)).toEqual({
			event: {
				summary: 'Frühlingskonzert',
				location: 'Aula',
				start: { dateTime: '2027-04-18T17:00:00', timeZone: 'Europe/Berlin' },
				end: { dateTime: '2027-04-18T19:00:00', timeZone: 'Europe/Berlin' }
			}
		});
	});

	it('makes a whole day without times, and guesses the end from the type', () => {
		expect(newEventFromForm(form({ type: 'probe', date: '2026-11-07' }), context)).toEqual({
			event: { summary: 'Probe', start: { date: '2026-11-07' }, end: { date: '2026-11-08' } }
		});
		const rehearsal = newEventFromForm(form({ type: 'probe', date: '2026-11-07', start: '10:00', concert: 'h', tentative: 'on' }), context);
		expect(rehearsal).toMatchObject({ event: { summary: 'Probe Herbstkonzert (?)', end: { dateTime: '2026-11-07T13:00:00' } } });
	});

	it('says what is wrong', () => {
		expect(newEventFromForm(form({ type: 'party', date: '2026-11-07' }), context)).toEqual({ error: 'type' });
		expect(newEventFromForm(form({ type: 'konzert', date: '2026-11-07' }), context)).toEqual({ error: 'title' });
		expect(newEventFromForm(form({ type: 'probe', date: '7.11.2026' }), context)).toEqual({ error: 'date' });
		const range = { first: '2023-10-23', last: '2028-04-15' };
		expect(newEventFromForm(form({ type: 'konzert', title: 'X', date: '2222-02-22' }), { ...context, range })).toEqual({ error: 'too-late' });
		expect(newEventFromForm(form({ type: 'probe', date: '2019-06-15' }), { ...context, range })).toEqual({ error: 'too-early' });
		expect(newEventFromForm(form({ type: 'probe', date: '2028-04-15' }), { ...context, range })).toHaveProperty('event');
		expect(newEventFromForm(form({ type: 'probe', date: '2026-11-07', start: '25:00' }), context)).toEqual({ error: 'time' });
		expect(newEventFromForm(form({ type: 'probe', date: '2026-11-07', end: '12:00' }), context)).toEqual({ error: 'time' });
		expect(newEventFromForm(form({ type: 'probe', date: '2026-11-07', start: '12:00', end: '10:00' }), context)).toEqual({ error: 'end' });
		expect(newEventFromForm(form({ type: 'probe', date: '2026-11-07', concert: 'gone' }), context)).toEqual({ error: 'concert' });
		expect(newEventFromForm(form({ type: 'konzert', title: 'X', date: '2026-11-07', concert: 'h' }), context)).toEqual({ error: 'concert' });
		expect(newEventFromForm(form({ type: 'probe', date: '2026-11-07', title: 'x'.repeat(121) }), context)).toEqual({ error: 'too-long' });
	});
});

describe('orchestras ticked one by one', () => {
	const shared: NewEventContext = { ...context, orchestras: ['EO', 'A', 'B'] };

	it('keeps them on the event too, unless all of them play', () => {
		expect(newEventFromForm(form({ type: 'probe', date: '2026-11-01', concert: 'h', orchestra: ['A', 'EO'] }), shared)).toMatchObject({
			event: { summary: 'Probe Herbstkonzert (EO, A)', extendedProperties: { shared: { orchester: 'EO, A' } } }
		});
		const all = newEventFromForm(form({ type: 'probe', date: '2026-11-01', concert: 'h', orchestra: ['EO', 'A', 'B'] }), shared);
		expect(all).toMatchObject({ event: { summary: 'Probe Herbstkonzert' } });
		expect('event' in all && all.event.extendedProperties).toBeFalsy();
	});
});

describe('orchestraTitle', () => {
	const orchestras = ['EO', 'A', 'B'];

	it('swaps the orchestras at the end of the title, and keeps the rest', () => {
		expect(orchestraTitle('Probe Herbstkonzert', ['A'], orchestras)).toBe('Probe Herbstkonzert (A)');
		expect(orchestraTitle('Probe Herbstkonzert (A)', ['EO', 'B'], orchestras)).toBe('Probe Herbstkonzert (EO, B)');
		expect(orchestraTitle('Probe Herbstkonzert (EO, A) (?)', ['EO', 'A', 'B'], orchestras)).toBe('Probe Herbstkonzert (?)');
		// Brackets that aren't orchestras stay.
		expect(orchestraTitle('Probe (Aula)', ['A'], orchestras)).toBe('Probe (Aula) (A)');
	});
});

describe('changing a date on its page', () => {
	const shared: NewEventContext = { ...context, orchestras: ['EO', 'A'] };

	it('fills the form in with local times, without "(?)" and the orchestras at the end', () => {
		const values = eventFormValues(
			{
				type: 'probe',
				title: 'Probentag (A) (?)',
				start: '2026-11-01T09:30:00Z',
				end: '2026-11-01T12:00:00Z',
				allDay: false,
				location: 'Aula',
				concertId: 'w',
				orchestras: 'A'
			},
			{ timeZone: 'Europe/Berlin', orchestras: ['EO', 'A'] }
		);
		expect(values).toMatchObject({ type: 'probe', title: 'Probentag', date: '2026-11-01', start: '10:30', end: '13:00', location: 'Aula', tentative: 'on', concert: 'w', orchestra: 'A' });
		expect(eventFormValues({ type: 'konzert', title: 'Herbstkonzert', start: '2026-11-15', end: '2026-11-16', allDay: true }, { timeZone: 'Europe/Berlin' })).toMatchObject({
			date: '2026-11-15',
			start: '',
			end: ''
		});
	});

	it('saved unchanged, keeps the title, even when the concert is linked only by date', () => {
		const editing = { ...shared, editing: { concertId: 'w' } };
		const result = newEventFromForm(form({ type: 'probe', title: 'Probentag', date: '2026-12-01', orchestra: 'A', concert: 'w', tentative: 'on' }), editing);
		expect(result).toMatchObject({ event: { summary: 'Probentag (A) (?)', extendedProperties: { shared: { orchester: 'A' } } } });
	});

	it('names a newly chosen concert, and may lie before the shown range', () => {
		const editing = { ...shared, range: { first: '2026-10-01', last: '2027-12-31' }, editing: { concertId: 'h' } };
		expect(newEventFromForm(form({ type: 'probe', title: 'Probentag', date: '2026-09-01', concert: 'w' }), editing)).toMatchObject({
			event: { summary: 'Probentag Weihnachtskonzert' }
		});
	});
});
