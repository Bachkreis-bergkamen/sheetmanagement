export const print = {
	link: 'Drucken',
	title: (concert: string) => 'Drucken: ' + concert,
	handout: 'Programmzettel',
	setlist: 'Setlist',
	handoutHint: 'Für das Publikum: Programm mit Komponisten.',
	setlistHint: 'Für Dirigat und Pult: groß, nummeriert, nur die Titel.',
	print: 'Drucken',
	back: 'Zurück zum Konzert',
	empty: 'Für dieses Konzert ist noch kein Programm eingetragen.',
	program: 'Programm',
	totalLength: (minutes: number) => `Dauer ca. ${minutes} Minuten`
} as const;
