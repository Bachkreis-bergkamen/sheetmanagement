/** The season report for the annual meeting (#147). */
export const season = {
	title: 'Saisonbericht',
	lead: 'Was in einem Zeitraum los war, zum Ausdrucken für die Jahreshauptversammlung. Anwesenheit nur als Summe, ohne Namen.',
	back: 'Chronik',
	from: 'Von',
	to: 'Bis',
	show: 'Anzeigen',
	print: 'Drucken',
	presets: {
		twelve: 'Letzte 12 Monate',
		season: (label: string) => `Saison ${label}`,
		lastYear: (year: number) => `${year}`,
		thisYear: (year: number) => `${year}`
	},
	presetsLabel: 'Zeitraum',
	heading: (orchestra: string) => `Saisonbericht ${orchestra}`,
	figures: 'Auf einen Blick',
	concerts: (n: number) => (n === 1 ? 'Konzert' : 'Konzerte'),
	pieces: (n: number) => (n === 1 ? 'Stück gespielt' : 'Stücke gespielt'),
	debuts: 'davon zum ersten Mal',
	rehearsals: (n: number) => (n === 1 ? 'Probe' : 'Proben'),
	concertsTitle: 'Konzerte und Programme',
	noConcerts: 'In diesem Zeitraum gab es kein Konzert.',
	noProgram: 'Programm nicht eingetragen',
	firstTime: 'zum ersten Mal',
	debutsTitle: 'Zum ersten Mal gespielt',
	noDebuts: 'Kein Stück war neu im Repertoire.',
	debutAt: (concert: string) => `bei ${concert}`,
	rehearsalsTitle: 'Proben',
	rehearsalCount: (n: number) => (n === 1 ? '1 Probe fand statt.' : `${n} Proben fanden statt.`),
	noCalendar: 'Der Kalender ist nicht verbunden, Proben fehlen deshalb.',
	attendance: (rehearsals: number, average: string, rate: number) =>
		`Bei ${rehearsals === 1 ? '1 Probe' : `${rehearsals} Proben`} wurde die Anwesenheit erfasst: im Schnitt ${average} Personen da, ${rate} % der Erfassten.`,
	noAttendance: 'In diesem Zeitraum wurde keine Anwesenheit erfasst.',
	archiveTitle: 'Archiv und Mitmachen',
	reports: (made: number, done: number) =>
		`${made === 1 ? '1 Problem mit Noten wurde' : `${made} Probleme mit Noten wurden`} gemeldet, ${done} davon ${done === 1 ? 'ist' : 'sind'} erledigt.`,
	wishes: (n: number) => (n === 1 ? '1 Wunsch wurde eingereicht.' : `${n} Wünsche wurden eingereicht.`),
	created: (day: string) => `Erstellt am ${day}. Proben stammen aus dem Kalender, der drei Jahre zurückreicht.`
} as const;
