import type { Texts } from '../types.ts';

/** The tour for new members: the essentials, then setting the app up on their profile; retaken from /profil. */
export const tour: Texts['tour'] = {
	label: 'Tour of the app',
	welcome: (name: string) => (name ? `Welcome, ${name}!` : 'Welcome!'),
	offer: 'In two minutes you’ll see where your dates and parts are, and set the app up for yourself.',
	offerOpen: 'In a minute you’ll see where the dates and parts are.',
	chapters: {
		basics: 'The essentials',
		basicsHint: (n: number) => `${n} short steps`,
		setup: 'Set it up for you',
		setupHint: 'Instrument, look, reminders'
	},
	start: 'Start the tour',
	skip: 'Skip',
	end: 'End the tour',
	back: 'Back',
	next: 'Next',
	finish: 'Done',
	step: (n: number, of: number) => `Step ${n} of ${of}`,
	setupOffer: {
		title: 'You know the essentials',
		body: 'Would you like to set the app up for yourself? It takes a minute.',
		start: 'Set it up',
		later: 'Later'
	},
	steps: {
		home: { title: 'Your next date', body: 'This always shows what’s coming up next. One tap says whether you’re coming and opens your parts for it.' },
		parts: { title: 'My parts', body: 'Your parts for the next rehearsals and concerts, matching your instrument. Saved offline, they work in the rehearsal hall without reception too.' },
		calendar: { title: 'Calendar', body: 'Every rehearsal and concert with time, place and programme. You answer later dates here too.' },
		pieces: { title: 'Archive', body: 'Every piece with parts, recordings and notes, under “More”. The field here filters the list, by part too; the magnifier at the top finds anything in the app.' },
		more: { title: 'More', body: 'All the other pages, such as the archive and the chronicle. At the very bottom you choose light or dark and the text size.' },
		instruments: { title: 'Your instrument', body: 'Enter what you play; “My parts” follows it. Once saved, it counts everywhere.' },
		view: { title: 'Look and text', body: 'Light, dark or like your device, and larger text if you like. Try it right away.' },
		notifications: { title: 'Reminders', body: 'Get reminders about replies, rehearsals and borrowed music: on this device or by email.' },
		install: { title: 'On your phone', body: 'As an app on the home screen, everything opens with one tap, even without reception. The guide shows you how.' },
		done: { title: 'All set!', body: 'Enjoy playing. You’ll find the tour here any time.' },
		doneOpen: { title: 'All set!', body: 'Enjoy playing. Light, dark and the text size are under “More”.' }
	},
	retake: 'Take the tour again',
	retakeHint: 'The essentials and your settings, step by step.'
};
