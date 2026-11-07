import { describe, expect, it } from 'vitest';
import { config } from '#lib/config/index.ts';
import { instrumentationFromScore, missingVoices, readInstrumentation, tidyRecognised, unreadEntries, voiceText, writeInstrumentation } from './instrumentation.ts';
import { createInstrumentMatcher, parsePartName } from './part-name.ts';
import type { Part } from './types.ts';

const matcher = createInstrumentMatcher(config.instruments);
let next = 0;
/** A part as the catalog builds it from a file name. */
function part(fileName: string): Part {
	const parsed = parsePartName(fileName, 'application/pdf', config.naming, matcher);
	return { id: `f${next++}`, fileName, label: parsed.label, kind: parsed.kind, family: parsed.family, instruments: parsed.instruments, voices: parsed.voices, notes: parsed.notes, status: parsed.status, mimeType: 'application/pdf', section: '', order: parsed.order };
}

describe('instrumentationFromScore', () => {
	it('reads the Italian names at the left of a classical score, one instrument each', () => {
		const labels = ['Allegro con brio', 'Flauto I, II', 'Oboi a 2', 'Clarinetti in B', 'Fagotti', 'Corni in F I. II.', 'Trombe in C', 'Timpani', 'Violino I', 'Violino II', 'Viola', 'Violoncello e Basso'];
		expect(instrumentationFromScore(labels, config)).toBe(
			'Flöte 1 & 2; Oboe 1 & 2; Klarinette; Fagott; Horn 1 & 2; Trompete; Pauke; Geige 1 & 2; Bratsche; Cello; Kontrabass'
		);
	});

	it('finds nothing in a page of only titles and tempo words', () => {
		expect(instrumentationFromScore(['Egmont', 'Ouvertüre', 'Ludwig van Beethoven', 'Sostenuto ma non troppo'], config)).toBe('');
	});

	it('leaves the score itself out', () => {
		expect(instrumentationFromScore(['Partitur', 'Violin 1'], config)).toBe('Geige 1');
	});
});

describe('tidyRecognised', () => {
	it('undoes the slips of text recognition, as it read a real score strip', () => {
		const read = ['Partitur', 'Egmor', 'Ottavino', 'Flauti a 2', 'Oboia 2', 'Clarinetti in Ba 2', 'Fagotti a 2', 'Corni in F 1. Il.', 'Trombe in C', 'Timpani', 'Violino |', 'Violino II', 'Viola', 'Violoncello e Basso', 'Demo-Noten - Sheetr'];
		expect(read.map(tidyRecognised).slice(4, 11)).toEqual(['Oboi a 2', 'Clarinetti in B a 2', 'Fagotti a 2', 'Corni in F 1. II.', 'Trombe in C', 'Timpani', 'Violino I']);
		expect(instrumentationFromScore(read.map(tidyRecognised), config)).toBe(
			'Piccolo; Flöte 1 & 2; Oboe 1 & 2; Klarinette 1 & 2; Fagott 1 & 2; Horn 1 & 2; Trompete; Pauke; Geige 1 & 2; Bratsche; Cello; Kontrabass'
		);
	});

	it('leaves words that only end in "a" alone', () => {
		expect(tidyRecognised('Viola 2')).toBe('Viola 2');
	});
});

describe('readInstrumentation', () => {
	it('reads what the sheet says, in its own words or the score’s', () => {
		expect(readInstrumentation('Flöte 1 & 2; Oboe\nGeige 1 & 2; Violoncello', config).map(voiceText)).toEqual(['Flöte 1 & 2', 'Oboe', 'Geige 1 & 2', 'Cello']);
		expect(readInstrumentation('', config)).toEqual([]);
	});
});

describe('missingVoices', () => {
	const voices = readInstrumentation('Flöte 1 & 2; Oboe; Geige 1 & 2; Bratsche; Violoncello; Kontrabass', config);

	it('names the instruments and numbers without a part', () => {
		const parts = [part('Flöte 1.pdf'), part('Geige 1.pdf'), part('Geige 2.pdf'), part('Viola.pdf'), part('Violoncello.pdf'), part('Kontrabass.pdf')];
		expect(missingVoices(voices, parts, config).map(voiceText)).toEqual(['Flöte 2', 'Oboe']);
	});

	it('counts a part for several instruments, and a shared part, for each', () => {
		const parts = [part('Flöte 1 & 2.pdf'), part('Oboe.pdf'), part('C-Stimmen.pdf'), part('Viola.pdf'), part('Violoncello & Kontrabass.pdf')];
		expect(missingVoices(voices, parts, config)).toEqual([]);
	});

	it('names only the clarinet whose part is missing', () => {
		const clarinets = readInstrumentation('Klarinette 1 & 2', config);
		expect(missingVoices(clarinets, [part('Klarinette in B 1.pdf')], config).map(voiceText)).toEqual(['Klarinette 2']);
	});
});

describe('editing the Besetzung with the instrument picker', () => {
	it('writes it back as the sheet keeps it, the same instrument once', () => {
		expect(
			writeInstrumentation([
				{ instrument: 'Flöte', numbers: [1, 2] },
				{ instrument: 'Oboe', numbers: [] },
				{ instrument: '', numbers: [] }
			])
		).toBe('Flöte 1 & 2; Oboe');
	});

	it('keeps what it cannot read, as written', () => {
		expect(unreadEntries('Flöte 1 & 2; Theremin; Oboe', config)).toEqual(['Theremin']);
		expect(writeInstrumentation(readInstrumentation('Flöte 1 & 2; Theremin', config), ['Theremin'])).toBe('Flöte 1 & 2; Theremin');
	});
});
