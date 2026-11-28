/** The Programmheft and the moderation sheet on the print page (#411); only that page loads these. */
export const factsPrint = {
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
	ownNotes: 'Eigene Notizen'
} as const;
