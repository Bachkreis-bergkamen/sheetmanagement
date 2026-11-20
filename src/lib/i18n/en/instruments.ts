import type { Texts } from '../types.ts';

export const instruments: Texts['instruments'] = {
	more: 'More instruments …',
	moreIn: (n: number) => `${n} more`,
	holds: 'Holds:',
	holdsOf: (part: string) => `Instruments in ${part}`,
	addHeld: 'Instruments',
	/** The tray under a part of a generic one: what it holds, tapped on and off. */
	heldPick: (part: string) => `What does ${part} play?`,
	/** A percussionist's setup in the profile: every part, or only those of what they play. */
	setupAll: (instrument: string) => `All ${instrument} parts`,
	setupSome: 'Only what I play',
	setupHint: 'You only get the parts of these instruments. Under “Adjust” you can leave single ones out.',
	setupNone: 'Nothing chosen: you get every part.',
	setupAdjust: 'Adjust',
	setupCount: (n: number, of: number) => (n === of ? 'all' : `${n} of ${of}`),
	setupOf: (set: string) => `Instruments in ${set}`,
	heldSearch: 'Search instruments …',
	/** On a tile: the instrument is in another of the part's numbers, a tap moves it here. */
	heldIn: (instrument: string, part: string) => `${instrument} is in ${part}, move it here`,
	/** On a tile: chosen on its own in the Besetzung, a tap moves it into this part. */
	heldAlone: 'alone',
	/** Instruments already in the Besetzung on their own that this generic part could hold. */
	suggestHeld: 'Already chosen:',
	moveInto: (instrument: string, part: string) => `Move ${instrument} into ${part}`,
	dragHint: 'Drag into a collective part',
	solo: 'Solo',
	soloHint: 'Soloist out front by the conductor. Without part numbers only the soloist plays.',
	key: 'Key',
	keyHint: 'The key the parts are written in. The usual one isn’t written down.',
	inKey: (key: string) => `in ${key}`,
	choose: 'Choose an instrument',
	search: 'Search instruments …',
	common: 'Common',
	none: (query: string) => `No instrument matches “${query}”.`,
	add: 'Another instrument',
	remove: 'Remove instrument',
	removeNamed: (name: string) => `Remove ${name}`,
	change: 'Change',
	done: 'Done',
	chosen: (n: number) => (n === 1 ? '1 instrument' : `${n} instruments`),
	numbers: 'Parts',
	score: (label: string) => `First page: ${label}`,
	scoreHint: 'The left edge of the first page names every instrument of the score.',
	numbersHint: 'none chosen: all parts',
	sheet: (label: string) => `Music: ${label}`,
	sheetPick: 'Which music',
	viewPart: (label: string) => `View part: ${label}`,
	fromParts: 'Take over from the parts',
	fromPartsHint: (text: string) => `Read from the parts there are: ${text}`
};
