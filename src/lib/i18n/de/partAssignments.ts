/** Who plays which part instead of their own (#262). */
export const partAssignments = {
	title: 'Stimmenzuteilung',
	lead: 'Wer statt der eigenen Stimme eine andere spielt, z. B. die Saxophone die Fagottstimme. In „Meine Noten“ und im Stimmensatz zählt dann diese.',
	none: 'Alle spielen ihre eigene Stimme.',
	add: 'Stimme zuteilen',
	who: 'Wer',
	instruments: 'Alle von einem Instrument',
	members: 'Einzelne Mitglieder',
	part: 'Spielt',
	number: 'Nr.',
	anyNumber: 'egal',
	concert: 'Gilt für',
	always: 'Immer',
	allPieces: 'Für alle Stücke, nicht nur dieses',
	save: 'Zuteilen',
	delete: 'Löschen',
	deleteNamed: (who: string, part: string) => `Zuteilung „${who} spielt ${part}“ löschen`,
	plays: (who: string, part: string) => `${who} spielt ${part}`,
	onlyConcert: (concert: string) => `Nur ${concert}`,
	everyPiece: 'Alle Stücke',
	forever: 'Immer',
	meta: (by: string, at: string) => [by, at].filter(Boolean).join(', '),
	assigned: 'zugeteilt',
	/** "Von" of a member's own pick of their part for a piece (Meine Noten). */
	ownPick: 'selbst gewählt',
	saved: 'Stimme zugeteilt.',
	deleted: 'Zuteilung gelöscht.',
	failed: 'Die Zuteilung konnte gerade nicht gespeichert werden. Bitte versuch es noch einmal.',
	notSetUp: 'Dem Blatt „Stimmenzuteilung“ fehlen Spalten. Auf der Seite „Tabelle einrichten“ werden sie ergänzt.',
	gone: 'Die Zuteilung gibt es nicht mehr; vielleicht hat sie jemand schon gelöscht.',
	problems: {
		who: 'Bitte ein Instrument oder Mitglied aus der Liste wählen.',
		part: 'Bitte eine Stimme aus der Liste wählen.',
		concert: 'Bitte ein Konzert aus der Liste wählen.'
	}
} as const;
