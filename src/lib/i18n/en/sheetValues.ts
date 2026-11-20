import type { Texts } from '../types.ts';

/** Values of the dropdown columns in "Reports" and "Wishes", as they appear in the sheet. */
/** Words the app writes into cells and reads back. */
export const sheetValues: Texts['sheetValues'] = {
	/** In "Recording": there is none, so "Complete details" stops asking. */
	noRecording: 'none',
	/** Offered under "Art" in "Ensembles"; any other word works too. */
	ensembleKinds: { choir: 'Choir', orchestra: 'Orchestra', band: 'Band', ensemble: 'Ensemble', soloist: 'Soloist' },
	/** Under "Priority" in "Missing parts". */
	priority: { high: 'high', medium: 'medium', low: 'low' }
};
