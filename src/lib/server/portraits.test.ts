import { describe, expect, it } from 'vitest';
import { deathYear, portraitFacts, portraitFrom, portraitOf, portraitPageUrl } from './portraits.ts';

const entity = (died: string | undefined, file?: string) => ({
	labels: { de: { value: 'Ludwig van Beethoven' } },
	claims: {
		...(file ? { P18: [{ mainsnak: { datavalue: { value: file } } }] } : {}),
		...(died ? { P570: [{ mainsnak: { datavalue: { value: { time: died, precision: 11 } } } }] } : {})
	}
});

describe('portraitOf', () => {
	it('takes the image of someone who died before 1900', () => {
		expect(portraitOf(entity('+1827-03-26T00:00:00Z', 'Beethoven.jpg'))).toEqual({ name: 'Ludwig van Beethoven', file: 'Beethoven.jpg' });
	});

	it('leaves out later composers, whose pictures may not be free, and anyone without image or date', () => {
		expect(portraitOf(entity('+1949-09-08T00:00:00Z', 'Richard Strauss.jpg'))).toBeNull();
		expect(portraitOf(entity('+1827-03-26T00:00:00Z'))).toBeNull();
		expect(portraitOf(entity(undefined, 'Someone.jpg'))).toBeNull();
		expect(portraitOf(undefined)).toBeNull();
	});
});

describe('deathYear and portraitPageUrl', () => {
	it('reads the year only when it is known to the year', () => {
		expect(deathYear({ P570: [{ mainsnak: { datavalue: { value: { time: '+1791-12-05T00:00:00Z', precision: 11 } } } }] })).toBe(1791);
		expect(deathYear({ P570: [{ mainsnak: { datavalue: { value: { time: '+1800-00-00T00:00:00Z', precision: 7 } } } }] })).toBeUndefined();
	});

	it('links the file on Commons', () => {
		expect(portraitPageUrl('Joseph Karl Stieler\'s Beethoven mit dem Manuskript.jpg')).toBe(
			'https://commons.wikimedia.org/wiki/File:Joseph_Karl_Stieler\'s_Beethoven_mit_dem_Manuskript.jpg'
		);
	});
});

describe('portraitFacts (#318)', () => {
	it('reads the small query instead of the whole entity', () => {
		const facts = portraitFacts({
			image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Beethoven.jpg' },
			died: { value: '1827' },
			labels: { value: 'mul:Ludwig van Beethoven|en:Beethoven' }
		});
		expect(facts).toEqual({ file: 'Beethoven.jpg', died: 1827, labels: { mul: 'Ludwig van Beethoven', en: 'Beethoven' } });
		expect(portraitFrom(facts)).toEqual({ name: 'Ludwig van Beethoven', file: 'Beethoven.jpg' });
		expect(portraitFrom(portraitFacts({ image: { value: 'x/John.jpg' }, died: { value: '1960' }, labels: { value: '' } }))).toBeNull();
		expect(portraitFrom(portraitFacts(undefined))).toBeNull();
	});
});
