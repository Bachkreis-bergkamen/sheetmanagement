import { describe, expect, it } from 'vitest';
import { config } from '#lib/config/index.ts';
import { instrumentationFromParts, instrumentationFromScore, missingVoices, pickedVoices, readInstrumentation, scoredVoices, tidyRecognised, unreadEntries, voiceText, writeInstrumentation } from './instrumentation.ts';
import { createInstrumentMatcher, parsePartName } from './part-name.ts';
import type { Part } from './types.ts';

const matcher = createInstrumentMatcher(config.instruments);
let next = 0;
/** A part as the catalog builds it from a file name. */
function part(fileName: string): Part {
	const parsed = parsePartName(fileName, 'application/pdf', config.naming, matcher);
	return { id: `f${next++}`, fileName, label: parsed.label, kind: parsed.kind, family: parsed.family, instruments: parsed.instruments, voices: parsed.voices, notes: parsed.notes, status: parsed.status, mimeType: 'application/pdf', section: '', order: parsed.order };
}

describe('instrumentationFromParts', () => {
	it('reads the Besetzung from the parts there are, numbers merged, generic parts with what they hold', () => {
		const parts = ['Partitur.pdf', 'Flöte 1.pdf', 'Flöte 2.pdf', 'Klarinette 1+2 in B.pdf', 'Percussion 1 - Triangel & Becken.pdf', 'Geige 1.pdf', 'Geige 2.pdf'].map(part);
		const text = instrumentationFromParts(parts);
		expect(text).toContain('Flöte 1 & 2');
		expect(text).toContain('Klarinette 1 & 2');
		expect(text).toMatch(/Percussion 1: Triangel & Becken/);
		expect(text).not.toMatch(/Partitur/);
	});

	it('is empty without a part naming an instrument', () => {
		expect(instrumentationFromParts([part('Partitur.pdf')])).toBe('');
	});
});

describe('instrumentationFromScore', () => {
	it('reads the Italian names at the left of a classical score, one instrument each', () => {
		const labels = ['Allegro con brio', 'Flauto I, II', 'Oboi a 2', 'Clarinetti in B', 'Fagotti', 'Corni in F I. II.', 'Trombe in C', 'Timpani', 'Violino I', 'Violino II', 'Viola', 'Violoncello e Basso'];
		expect(instrumentationFromScore(labels, config)).toBe(
			'Flöte 1 & 2; Oboe 1 & 2; Klarinette; Fagott; Horn 1 & 2; Trompete in C; Pauke; Geige 1 & 2; Bratsche; Cello; Kontrabass'
		);
	});

	it('finds nothing in a page of only titles and tempo words', () => {
		expect(instrumentationFromScore(['Egmont', 'Ouvertüre', 'Ludwig van Beethoven', 'Sostenuto ma non troppo'], config)).toBe('');
	});

	it('reads the alto clarinet apart from the clarinet', () => {
		expect(instrumentationFromScore(['Clarinetto in B', 'Clarinetto alto in Es'], config)).toBe('Klarinette; Altklarinette');
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
			'Piccolo; Flöte 1 & 2; Oboe 1 & 2; Klarinette 1 & 2; Fagott 1 & 2; Horn 1 & 2; Trompete in C; Pauke; Geige 1 & 2; Bratsche; Cello; Kontrabass'
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

	it('keeps a generic part with the instruments it names as one voice', () => {
		const voices = readInstrumentation('Percussion 1: Triangel & Becken; Percussion 2; Chor: Sopran & Alt; Percussion 1: Kuhglocke', config);
		expect(voices.map(voiceText)).toEqual(['Percussion 1: Triangel & Becken & Kuhglocke', 'Percussion 2', 'Chor: Sopran & Alt']);
		expect(writeInstrumentation(voices)).toBe('Percussion 1: Triangel & Becken & Kuhglocke; Percussion 2; Chor: Sopran & Alt');
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

	it('finds the generic part under its number', () => {
		const voices = readInstrumentation('Percussion 1: Triangel & Becken; Chor: Sopran & Alt', config);
		expect(missingVoices(voices, [part('Percussion I - Triangel & Becken.pdf')], config).map(voiceText)).toEqual(['Chor: Sopran & Alt']);
	});

	it('reads Mallet Percussion as a collective part, like Percussion', () => {
		const mallets = readInstrumentation('Mallet Percussion 1: Xylophon & Glockenspiel; Mallet Percussion 2: Marimba', config);
		expect(mallets.map(voiceText)).toEqual(['Mallet Percussion 1: Xylophon & Glockenspiel', 'Mallet Percussion 2: Marimba']);
		expect(missingVoices(mallets, [part('Mallet Percussion I - Xylophon & Glockenspiel.pdf')], config).map(voiceText)).toEqual(['Mallet Percussion 2: Marimba']);
	});

	it('keeps a soloist apart from the section, and finds the solo part', () => {
		const concerto = readInstrumentation('Solo Geige; Geige 1 & 2; Solo Klavier', config);
		expect(concerto.map(voiceText)).toEqual(['Solo Geige', 'Geige 1 & 2', 'Solo Klavier']);
		const parts = [part('Geige I.pdf'), part('Geige II.pdf'), part('Klavier.pdf')];
		// The violins' parts aren't the soloist's; the piano's only part is.
		expect(missingVoices(concerto, parts, config).map(voiceText)).toEqual(['Solo Geige']);
		expect(missingVoices(concerto, [...parts, part('@Geige.pdf')], config)).toEqual([]);
	});

	it('names only the clarinet whose part is missing', () => {
		const clarinets = readInstrumentation('Klarinette 1 & 2', config);
		expect(missingVoices(clarinets, [part('Klarinette in B 1.pdf')], config).map(voiceText)).toEqual(['Klarinette 2']);
	});
});

describe('a soloist in the instrument picker', () => {
	it('writes the soloist alone, or with the section that plays too', () => {
		const picked = pickedVoices(readInstrumentation('Solo Geige; Geige 1 & 2; Solo Klavier; Solo Flöte; Flöte', config));
		expect(picked.find((voice) => voice.instrument === 'Klavier')).toMatchObject({ solo: true, tutti: false });
		expect(writeInstrumentation(scoredVoices(picked))).toBe('Solo Geige; Geige 1 & 2; Solo Klavier; Solo Flöte; Flöte');
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

describe('generic parts in the instrument picker', () => {
	it('shows one row per instrument, with what each number names', () => {
		const picked = pickedVoices(readInstrumentation('Percussion 1: Triangel & Becken; Percussion 2; Flöte 1 & 2', config));
		expect(picked).toEqual([
			{ instrument: 'Percussion', numbers: [1, 2], held: { 1: ['Triangel', 'Becken'] } },
			{ instrument: 'Flöte', numbers: [1, 2], held: {} }
		]);
		expect(writeInstrumentation(scoredVoices(picked))).toBe('Percussion 1: Triangel & Becken; Percussion 2; Flöte 1 & 2');
	});

	it('writes a part without a number, and drops what a removed number named', () => {
		expect(writeInstrumentation(scoredVoices([{ instrument: 'Chor', numbers: [], held: { 0: ['Sopran', 'Alt'] } }]))).toBe('Chor: Sopran & Alt');
		expect(writeInstrumentation(scoredVoices([{ instrument: 'Percussion', numbers: [2], held: { 1: ['Triangel'] } }]))).toBe('Percussion 2');
	});
});

describe('the key a part is written in', () => {
	it('writes a key only when it isn’t the instrument’s usual one', () => {
		const voices = readInstrumentation('Horn 1 & 2 in Es; Horn in F 3; Klarinette 1 & 2 in B; Trompete in C', config);
		expect(voices.map(voiceText)).toEqual(['Horn 1 & 2 in Es', 'Horn 3', 'Klarinette 1 & 2', 'Trompete in C']);
	});

	it('reads the key as a score names it', () => {
		expect(readInstrumentation('Corno I, II in Es; Clarinetto in A a 2', config).map(voiceText)).toEqual(['Horn 1 & 2 in Es', 'Klarinette 1 & 2 in A']);
	});

	it('leaves the key out for an instrument that isn’t written in one', () => {
		expect(readInstrumentation('Flöte in C; Geige 1', config).map(voiceText)).toEqual(['Flöte', 'Geige 1']);
	});

	it('keeps the picker’s key for the soloist and the section', () => {
		const picked = pickedVoices(readInstrumentation('Solo Klarinette in A; Klarinette 1 & 2 in A', config));
		expect(picked).toEqual([{ instrument: 'Klarinette', numbers: [1, 2], held: {}, solo: true, tutti: true, key: 'A' }]);
		expect(writeInstrumentation(scoredVoices(picked))).toBe('Solo Klarinette in A; Klarinette 1 & 2 in A');
		expect(writeInstrumentation(scoredVoices([{ instrument: 'Horn', numbers: [1, 2], held: {} }]))).toBe('Horn 1 & 2');
	});
});
