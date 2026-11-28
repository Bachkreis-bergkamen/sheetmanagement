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
	totalLength: (minutes: number) => `Dauer ca. ${minutes} Minuten`,
	/** With each piece's "Wissenswertes" (#411). */
	booklet: 'Programmheft',
	bookletHint: 'Für das Publikum: das Programm mit Wissenswertem zu jedem Stück.',
	moderation: 'Moderation',
	moderationHint: 'Für die Ansage: Reihenfolge, Startzeit, Dauer und was es über jedes Stück zu erzählen gibt.',
	/** The programme's gaps for the booklet and the moderation, not printed. */
	factsGaps: (n: number) => (n === 1 ? '1 Stück hat noch kein Wissenswertes.' : `${n} Stücken fehlt noch Wissenswertes.`),
	factsComplete: 'Zu jedem Stück steht Wissenswertes.',
	fill: 'Ergänzen',
	/** Minutes into the concert a piece starts, from the durations before it. */
	startsAt: (minutes: number) => `ab Min. ${minutes}`,
	speakingTotal: (minutes: number) => `Moderation ca. ${minutes} Min.`,
	nothingToTell: 'Noch nichts eingetragen.',
	/** An empty box on the moderation sheet for notes by hand. */
	ownNotes: 'Eigene Notizen',
	piece: (n: number) => `Stück ${n}`
} as const;
