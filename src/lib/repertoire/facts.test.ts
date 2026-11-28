import { describe, expect, it } from 'vitest';
import { factSegments, parseFacts, speakingSeconds, tidyFacts, withSource } from './facts.ts';

describe('facts', () => {
	it('are tidied: line ends, empty lines', () => {
		expect(tidyFacts('  Eins  \r\n\r\n\r\n\r\nZwei \n')).toBe('Eins\n\nZwei');
	});

	it('read as paragraphs, with lines of one paragraph run on', () => {
		const facts = parseFacts('Beethoven schrieb die Musik 1810.\nFür das Burgtheater.\n\nDie Ouvertüre wird oft allein gespielt.');
		expect(facts.paragraphs).toEqual([
			[{ text: 'Beethoven schrieb die Musik 1810. Für das Burgtheater.' }],
			[{ text: 'Die Ouvertüre wird oft allein gespielt.' }]
		]);
		expect(facts.sources).toEqual([]);
	});

	it('keep sources apart, in German and English', () => {
		const facts = parseFacts('Text.\nQuelle: Wikipedia, https://de.wikipedia.org/wiki/Egmont_(Beethoven).\n\nSource: the score');
		expect(facts.paragraphs).toEqual([[{ text: 'Text.' }]]);
		expect(facts.sources).toEqual([
			[{ text: 'Wikipedia, ' }, { url: 'https://de.wikipedia.org/wiki/Egmont_(Beethoven)', label: 'de.wikipedia.org' }, { text: '.' }],
			[{ text: 'the score' }]
		]);
	});

	it('find links, without the full stop after them', () => {
		expect(factSegments('Siehe https://www.example.org/a?b=1. Danke')).toEqual([
			{ text: 'Siehe ' },
			{ url: 'https://www.example.org/a?b=1', label: 'example.org' },
			{ text: '. Danke' }
		]);
	});

	it('know how long reading them out takes, sources and links left out', () => {
		expect(speakingSeconds('')).toBe(0);
		expect(speakingSeconds(Array(130).fill('Wort').join(' ') + '\nQuelle: eins zwei drei https://x.org')).toBe(60);
	});

	it('get a lookup appended, its source line right under it', () => {
		expect(withSource('', 'Die Egmont-Musik …', 'Quelle: Wikipedia')).toBe('Die Egmont-Musik …\nQuelle: Wikipedia');
		expect(withSource('Von uns.', 'Die Egmont-Musik …', 'Quelle: Wikipedia')).toBe('Von uns.\n\nDie Egmont-Musik …\nQuelle: Wikipedia');
	});
});
