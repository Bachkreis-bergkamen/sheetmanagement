import { describe, expect, it } from 'vitest';
import { checkConcert, refChanges, rewriteRefs } from './concert-edit.ts';
import { LAYOUT, readTable } from './sheet.ts';

const HEADER = ['Datum', 'Anlass', 'Ort', 'Orchester', 'Kalender-Event-ID'];
const concerts = readTable([HEADER, ['21.12.1957', 'Weihnachtskonzert', 'Kirche', 'EO', ''], ['1962', 'Sommerkonzert', '', 'EO', '']], LAYOUT.concerts.columns);
const values = (title: string, date: string) => ({ title, date, location: '', orchestra: 'EO' });
const program = readTable(
	[
		['Konzert', 'Nr.', 'Stück', 'Bemerkung'],
		['Weihnachtskonzert', '1', 'Sleigh Ride', ''],
		['Sommerkonzert', '1', 'Ave Maria', '']
	],
	LAYOUT.program.columns
);

describe('checkConcert', () => {
	it('refuses only the same name on the same day', () => {
		expect(checkConcert(values('weihnachtskonzert', '1957-12-21'), concerts)).toEqual({ problem: 'day-taken' });
		expect(checkConcert(values('Weihnachtskonzert', '20.12.1958'), concerts)).toMatchObject({ values: { date: '20.12.1958' } });
		// Its own row doesn't count: a concert saved unchanged.
		expect(checkConcert(values('Weihnachtskonzert', '21.12.1957'), concerts, 2)).toMatchObject({ values: { title: 'Weihnachtskonzert' } });
	});
});

describe('names that follow a concert', () => {
	it('gives the rows of a concert its date once a second one takes the name', () => {
		const next = [...concerts.rows.map((row) => ({ row: row.row, values: values(row.values.title, row.values.date) })), { row: -1, values: values('Weihnachtskonzert', '1958') }];
		const changes = refChanges(concerts, next);
		expect(changes).toEqual([{ from: ['Weihnachtskonzert'], to: 'Weihnachtskonzert (21.12.1957)' }]);
		expect(rewriteRefs(program, 'concert', changes)).toEqual([{ row: 2, values: { concert: 'Weihnachtskonzert (21.12.1957)' } }]);
	});

	it('follows a renamed concert', () => {
		const next = concerts.rows.map((row) => ({ row: row.row, values: row.row === 3 ? values('Sommerfest', '1962') : values(row.values.title, row.values.date) }));
		expect(rewriteRefs(program, 'concert', refChanges(concerts, next))).toEqual([{ row: 3, values: { concert: 'Sommerfest' } }]);
	});

	it('leaves a bare shared name alone: it named neither', () => {
		const shared = readTable([HEADER, ['1957', 'Konzert', '', '', ''], ['1958', 'Konzert', '', '', '']], LAYOUT.concerts.columns);
		const next = [{ row: 2, values: values('Konzert', '1957') }, { row: 3, values: values('Gala', '1958') }];
		const rows = readTable([['Konzert', 'Nr.', 'Stück', 'Bemerkung'], ['Konzert', '1', 'X', ''], ['Konzert (1958)', '1', 'Y', '']], LAYOUT.program.columns);
		expect(rewriteRefs(rows, 'concert', refChanges(shared, next))).toEqual([{ row: 3, values: { concert: 'Gala' } }]);
	});
});
