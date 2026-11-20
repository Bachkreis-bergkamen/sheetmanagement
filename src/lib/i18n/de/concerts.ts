export const concerts = {
	title: 'Kalender',
	lead: 'Proben, Konzerte und Terminumfragen.',
	empty: 'Sobald der Probenkalender verbunden ist, erscheinen hier alle Konzerte und Proben.',
	failed: 'Der Kalender konnte gerade nicht geladen werden. Versuch es gleich noch einmal.',
	past: 'Vergangene Konzerte',
	noUpcoming: 'Gerade stehen keine Termine im Kalender.',
	subscribe: 'Google Kalender abonnieren',
	ownCalendar: 'Termine in meinen Kalender',
	filters: { kind: 'Art', answer: 'Meine Antwort', concerts: 'Konzerte', rehearsals: 'Proben' },
	view: 'Ansicht',
	list: 'Liste',
	calendar: 'Monat',
	next: 'Als Nächstes',
	today: 'Heute',
	previousMonth: 'Vorheriger Monat',
	nextMonth: 'Nächster Monat',
	noEventsThatDay: 'An diesem Tag ist nichts eingetragen.',
	types: {
		konzert: 'Konzert',
		generalprobe: 'Generalprobe',
		probe: 'Probe',
		sonstiges: 'Termin'
	},
	tentative: 'noch unsicher',
	allDay: 'ganztägig',
	relative: (days: number) =>
		days === 0 ? 'heute' : days === 1 ? 'morgen' : days > 1 ? `in ${days} Tagen` : days === -1 ? 'gestern' : `vor ${-days} Tagen`,
	forConcert: (title: string) => `für ${title}`
} as const;
