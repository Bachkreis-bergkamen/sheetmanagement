import type { Texts } from '../types.ts';

export const details: Texts['details'] = {
	title: 'Complete details',
	lead: 'Pieces with missing details, one after another. Suggestions help.',
	filterLabel: "What's missing",
	filters: {
		alle: 'Something missing',
		komponist: 'Without composer',
		genre: 'Without genre',
		hoerbeispiel: 'Without recording',
		werkverzeichnis: 'Without catalogue no.'
	} as Record<string, string>,
	missing: { composer: 'Composer', genre: 'Genre', recording: 'Recording', catalogue: 'Catalogue no.' } as Record<string, string>,
	progress: (percent: number) => `${percent} % of pieces complete`,
	start: (n: number) => (n === 1 ? 'Edit the one piece' : `Edit one after another (${n})`),
	working: (filter: string, open: number) => `Complete details · ${filter}: ${open} ${open === 1 ? 'piece' : 'pieces'} to go.`,
	saveNext: 'Save & next',
	backToList: 'Back to the list',
	allDone: 'Done: nothing is open in this list any more.',
	none: 'Nothing missing here.',
	noRecording: 'There is none',
	noRecordingHint: (title: string) => `“${title}” has no recording: stop asking`,
	noRecordingSaved: (title: string) => `“${title}”: marked as without a recording.`
};
