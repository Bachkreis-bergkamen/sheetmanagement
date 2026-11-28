import type { Texts } from '../types.ts';

export const print: Texts['print'] = {
	link: 'Print',
	title: (concert: string) => 'Print: ' + concert,
	handout: 'Programme sheet',
	setlist: 'Setlist',
	handoutHint: 'For the audience: programme with composers.',
	setlistHint: 'For conductor and stands: large, numbered, titles only.',
	print: 'Print',
	back: 'Back to the concert',
	empty: 'No programme entered for this concert yet.',
	program: 'Programme',
	totalLength: (minutes: number) => `About ${minutes} minutes`
};
