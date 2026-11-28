import type { Texts } from '../types.ts';

/** The "Wissenswertes" field in the piece editor and its Wikipedia lookup (#411); only the editor loads these. */
export const factsLookup: Texts['factsLookup'] = {
	hint: 'Where the piece comes from, how we got it, stories about it – for the presenter and the programme booklet. An empty line starts a new paragraph, "Source: …" goes on a line of its own.',
	placeholder: 'e.g. Beethoven wrote the music in 1810 for Goethe’s play …',
	lookup: 'Search Wikipedia',
	lookupHint: 'Searches for the title and composer. The text belongs to Wikipedia (CC BY-SA): what you take over gets a source line.',
	webSearch: 'Search the web',
	searching: 'Searching …',
	loading: 'Loading article …',
	query: 'Search for',
	search: 'Search',
	nothing: 'Wikipedia has no article for this. Another search, the original title say, may help.',
	noIntro: 'The article has no introduction to take over.',
	busy: 'Wikipedia asks for a short pause. Try again in a moment.',
	failed: 'Wikipedia could not be reached.',
	inLanguage: (language: string) => (language === 'de' ? 'German' : 'English'),
	take: 'Take over',
	takeHint: 'Appends the introduction with a source line to the field. Shortening it into your own words is worth it.',
	close: 'Close',
	back: 'Other results',
	source: (title: string, url: string) => `Source: Wikipedia, "${title}" (CC BY-SA 4.0) ${url}`,
	sourceName: 'Wikipedia'
};
