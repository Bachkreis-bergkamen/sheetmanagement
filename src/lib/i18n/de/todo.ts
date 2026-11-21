/** Everything waiting for you, in one list (#185). */
export const todo = {
	title: 'Zu erledigen',
	lead: 'Alles, was gerade auf dich wartet, an einem Ort. Jede Zeile führt dahin, wo du es erledigst.',
	empty: 'Nichts offen. Schön!',
	/** Before a deadline: polls and rented music. */
	until: (date: string) => `bis ${date}`,
	kinds: {
		report: 'Meldungen',
		request: 'Zugangsanfragen',
		wish: 'Wünsche',
		loan: 'Leihmaterial zurückgeben',
		instrument: 'Leihinstrumente zurücknehmen',
		attendance: 'Anwesenheit eintragen',
		poll: 'Terminumfragen beantworten',
		other: 'Außerdem'
	} as Record<string, string>,
	/** On the organisers' hub, above the groups. */
	hub: (n: number) => (n === 1 ? '1 Sache wartet' : `${n} Dinge warten`)
} as const;
