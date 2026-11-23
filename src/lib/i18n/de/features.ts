/** Parts of the app that can be turned off (#134), by their key in src/lib/features.ts. */
export const features = {
	loans: 'Leihmaterial',
	musicReport: 'Musikfolge (GEMA)',
	attendance: 'Anwesenheit',
	signups: 'Anmeldungen',
	wishes: 'Wünsche',
	calendarFeed: 'Kalender-Abo',
	offline: 'Noten offline speichern',
	seasons: 'Jahreszeiten',
	tickets: 'Konzertkarten',
	drills: 'Übebereich',
	trips: 'Fahrten',
	lending: 'Leihinstrumente',
	duties: 'Dienste',
	polls: 'Terminumfragen',
	kummer: 'Kummerkasten',
	parents: 'Elternbereich',
	chronicle: 'Chronik'
} as const;
