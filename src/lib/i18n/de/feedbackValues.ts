export const feedbackValues = {
	reportKind: {
		missing: 'Stimme fehlt',
		pages: 'Seiten fehlen',
		cutoff: 'Noten abgeschnitten',
		crooked: 'Schief oder verdreht',
		scan: 'Schlechter Scan',
		empty: 'Datei leer',
		wrong: 'Falsche Stimme',
		/** A wrong note, a typo, wrong bar numbers in the music itself (#306), not the scan. */
		notes: 'Fehler in den Noten',
		/** The piece's Hörbeispiel is wrong or missing; the report can carry a better link. */
		recording: 'Hörbeispiel falsch',
		other: 'Sonstiges'
	},
	/** Neu → zum Scannen (ans Scan-Team gegeben) → erledigt; oder verworfen. */
	reportStatus: { open: 'offen', scan: 'zum Scannen', done: 'erledigt', dismissed: 'verworfen' },
	wishKind: { piece: 'Stück', feature: 'Funktion' },
	wishStatus: { open: 'offen', planned: 'geplant', done: 'erledigt', declined: 'abgelehnt' }
} as const;
