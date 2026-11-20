import type { Texts } from '../types.ts';

export const feedbackValues: Texts['feedbackValues'] = {
	reportKind: {
		missing: 'Part missing',
		pages: 'Pages missing',
		cutoff: 'Notes cut off',
		crooked: 'Crooked or rotated',
		scan: 'Bad scan',
		empty: 'File empty',
		wrong: 'Wrong part',
		/** A wrong note, a typo, wrong bar numbers in the music itself (#306), not the scan. */
		notes: 'Mistake in the music',
		/** The piece's recording is wrong or missing; the report can carry a better link. */
		recording: 'Wrong recording',
		other: 'Other'
	},
	/** New → to scan (handed to the scanning team) → done; or dismissed. */
	reportStatus: { open: 'open', scan: 'to scan', done: 'done', dismissed: 'dismissed' },
	wishKind: { piece: 'Piece', feature: 'Feature' },
	wishStatus: { open: 'open', planned: 'planned', done: 'done', declined: 'declined' }
};
