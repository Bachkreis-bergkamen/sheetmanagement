import type { Texts } from '../types.ts';

export const pieceEditor: Texts['pieceEditor'] = {
	filled: (count: number) => `${count} filled in`,
	suggested: (source: string) => `Suggestion (${source}) – is it right?`,
	confirm: 'Looks right',
	undo: 'Undo',
	unchecked: (count: number) => (count === 1 ? '1 suggestion taken over is not checked yet.' : `${count} suggestions taken over are not checked yet.`),
	videoLength: (length: string) => `The video is ${length} long.`,
	useVideoLength: 'Use as duration',
	title: (piece: string) => `Edit: ${piece}`,
	lead: 'What is entered here applies instead of the folder name.',
	recordingHint: 'Link to a recording, e.g. YouTube',
	/** Writes the sheet's word for "no recording" into the field. */
	noRecording: 'There is none',
	noRecordingHint: "For pieces without a recording: “Complete details” won't ask for one any more.",
	reviewedHint: 'e.g. 2026-10-18',
	today: 'Today',
	save: 'Save',
	cancel: 'Cancel',
	conflict: 'Someone has changed the piece meanwhile. Reload the page and make your change again.',
	notInSheet: 'Not in the sheet yet. New folders are added within a minute.',
	renamed: (n: number) => (n === 1 ? 'The new title was also applied in 1 programme.' : `The new title was also applied in ${n} programmes.`),
	problems: {
		'title-missing': 'Please give a title.',
		'title-taken': 'Another piece has this title already. Programmes find pieces by title, so it must be unique.',
		'bad-link': 'The recording must be a link starting with http:// or https://, or “none”.',
		'bad-duration': "The duration can't be read. Possible are e.g. 7:30, 7 min. or 1:02:00."
	},
	durationHint: 'e.g. 7:30',
	composerHint: 'several with commas: Mozart, Haydn',
	composerFullHint: 'e.g. Ludwig van Beethoven, for the music report',
	/** Medleys and suites: one song per line, the composers come from there. */
	contentsHint: 'For medleys and suites: one title per line, e.g. Habanera – Bizet',
	contentsLead: 'Each title is found by the search. If “Composer” stays empty, it shows the composers from the contents, shortened to two and “and more”.',
	composerFromContents: (names: string) => `from the contents: ${names}`,
	/** Empties "Composer" so it follows the contents. */
	useContentsComposers: 'Take from the contents',
	useContentsComposersHint: 'Empties the field: the composers then come from the contents and stay short.',
	listHint: 'separate several with commas',
	publisherHint: 'e.g. Bärenreiter – for the music report',
	unreadInstrumentation: (text: string) => `Not recognised as an instrument, kept as written: ${text}`,
	missingColumns: (columns: string) => `${columns}: these columns aren't in the sheet yet. Run “Set up sheet” once, then they can be entered here.`
};
