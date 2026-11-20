/** Values of the dropdown columns in "Meldungen" and "Wünsche", as they appear in the sheet. */
/** Words the app writes into cells and reads back. */
export const sheetValues = {
	/** In "Hörbeispiel": there is none, so "Angaben ergänzen" stops asking. */
	noRecording: 'keins',
	/** Offered under "Art" in "Ensembles"; any other word works too. */
	ensembleKinds: { choir: 'Chor', orchestra: 'Orchester', band: 'Band', ensemble: 'Ensemble', soloist: 'Solist:in' },
	/** Under "Priorität" in "Fehlende Stimmen". */
	priority: { high: 'hoch', medium: 'mittel', low: 'niedrig' }
} as const;
