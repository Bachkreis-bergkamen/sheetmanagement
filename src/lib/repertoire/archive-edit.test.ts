import { describe, expect, it } from 'vitest';
import { checkNewConcert, checkNewPiece, similarPieces } from './archive-edit.ts';
import { LAYOUT, readTable } from './sheet.ts';

const concerts = readTable(
	[
		['Datum', 'Anlass', 'Ort', 'Orchester', 'Kalender-Event-ID'],
		['1957-12', 'Weihnachtskonzert 1957', 'Kirche', 'EO', '']
	],
	LAYOUT.concerts.columns
);
const pieces = readTable([['Titel', 'Komponist'], ['Sleigh Ride', 'Anderson']], LAYOUT.pieces.columns);
const concert = { date: '1962', title: 'Sommerkonzert 1962', location: '', orchestra: 'EO' };

describe('checkNewConcert', () => {
	it.each(['1962', '1962-06', '21.06.1962', '06.1962', ''])('accepts the date %j', (date) => {
		expect(checkNewConcert({ ...concert, date }, concerts)).toEqual({ values: { ...concert, date } });
	});

	it.each([
		[{ title: '  ' }, 'title-missing'],
		[{ date: 'im Sommer' }, 'bad-date'],
		[{ title: 'weihnachtskonzert 1957 ', date: '12.1957' }, 'day-taken'],
		[{ title: 'Weihnachtskonzert 1957', date: '1957-12' }, 'day-taken']
	] as const)('%j → %s', (change, problem) => {
		expect(checkNewConcert({ ...concert, ...change }, concerts)).toEqual({ problem });
	});

	it('takes a name again for another day: the day decides', () => {
		expect(checkNewConcert({ ...concert, title: 'Weihnachtskonzert 1957', date: '21.12.1957' }, concerts)).toMatchObject({ values: { date: '21.12.1957' } });
	});

	it('trims what was typed', () => {
		expect(checkNewConcert({ ...concert, location: ' Aula ' }, concerts)).toMatchObject({ values: { location: 'Aula' } });
	});
});

describe('checkNewPiece', () => {
	it('accepts a new title and refuses one that exists', () => {
		expect(checkNewPiece({ title: 'Ave Maria', composer: 'Schubert', catalogue: 'D 839' }, pieces)).toMatchObject({ values: { title: 'Ave Maria' } });
		expect(checkNewPiece({ title: 'SLEIGH RIDE', composer: '', catalogue: '' }, pieces)).toEqual({ problem: 'title-taken' });
		expect(checkNewPiece({ title: '', composer: 'X', catalogue: '' }, pieces)).toEqual({ problem: 'title-missing' });
	});
});

describe('similarPieces', () => {
	const archive = [
		{ title: 'Ungarischer Tanz Nr. 5', composer: 'Brahms' },
		{ title: '5. Sinfonie c-Moll', composer: 'Ludwig van Beethoven' },
		{ title: 'Sleigh Ride', composer: 'Anderson' },
		{ title: 'Eine kleine Nachtmusik', composer: 'Mozart' }
	];
	const titles = (input: { title: string; composer?: string }) => similarPieces(input, archive).map((piece) => piece.title);

	it('finds the same title written another way', () => {
		expect(titles({ title: 'Ungarischer Tanz 5' })).toEqual(['Ungarischer Tanz Nr. 5']);
		expect(titles({ title: 'ungarischer tanz no. 5' })).toEqual(['Ungarischer Tanz Nr. 5']);
	});

	it('finds a title a letter off', () => {
		expect(titles({ title: 'Eine kleine Nachtmusick' })).toEqual(['Eine kleine Nachtmusik']);
		expect(titles({ title: 'Kleine Nachtmusik' })).toEqual(['Eine kleine Nachtmusik']);
	});

	it('finds a similar title by the same composer', () => {
		expect(titles({ title: 'Sinfonie 5', composer: 'Beethoven' })).toEqual(['5. Sinfonie c-Moll']);
		expect(titles({ title: 'Sinfonie 5', composer: 'Schubert' })).toEqual([]);
	});

	it('leaves other pieces alone', () => {
		expect(titles({ title: 'Ungarischer Tanz 6' })).toEqual([]);
		expect(titles({ title: 'Ave Maria', composer: 'Schubert' })).toEqual([]);
		expect(titles({ title: '  ' })).toEqual([]);
	});
});
