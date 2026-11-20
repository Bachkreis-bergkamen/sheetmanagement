export const musicReport = {
	tab: 'Musikfolge (GEMA)',
	title: 'Musikfolge',
	hint: 'Für die GEMA-Meldung, als CSV ins Formular übernehmen.',
	csv: 'Als CSV laden',
	columns: {
		position: 'Nr.',
		title: 'Titel',
		composer: 'Komponist',
		arranger: 'Bearbeiter',
		publisher: 'Verlag',
		duration: 'Dauer',
		performers: 'Ausführende'
	},
	gaps: (n: number) => (n === 1 ? 'Bei 1 Stück fehlen noch Angaben:' : `Bei ${n} Stücken fehlen noch Angaben:`),
	missing: { composer: 'Komponist', composerFull: 'Komponist (voll)', publisher: 'Verlag', duration: 'Dauer' } as Record<string, string>,
	complete: 'Alle Angaben sind da.',
	fullNames: 'Die GEMA möchte Komponisten mit vollem Namen, z. B. „Ludwig van Beethoven“ statt „Beethoven“. Die Liste nimmt dafür die Spalte „Komponist (voll)“; „Online nachschlagen“ beim Bearbeiten füllt sie.',
	fill: 'Ergänzen',
	organizer: 'Veranstalter',
	date: 'Datum',
	venue: 'Ort'
} as const;
