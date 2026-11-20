/** Notes after a rehearsal (#145). */
export const rehearsalNotes = {
	title: 'Aus der Probe',
	previous: (date: string) => `Aus der letzten Probe, ${date}`,
	done: 'Geprobt',
	practise: 'Zum Üben',
	next: 'Nächstes Mal',
	doneHint: 'z. B. „Egmont bis Takt 120“',
	practiseHint: 'z. B. „ab Buchstabe B langsam“',
	nextHint: 'z. B. „Morgenstimmung, ab B“',
	write: 'Notiz schreiben',
	edit: 'Notiz bearbeiten',
	lead: 'Für alle, die nicht da waren. Alle Felder leeren entfernt die Notiz.',
	empty: 'Noch keine Notiz zu dieser Probe.',
	save: 'Speichern',
	cancel: 'Abbrechen',
	by: (by: string, at: string) => [by, at].filter(Boolean).join(', '),
	saved: 'Notiz gespeichert.',
	tooLong: 'Höchstens 1000 Zeichen pro Feld, bitte.',
	failed: 'Die Notiz konnte gerade nicht gespeichert werden. Bitte versuch es noch einmal.',
	notSetUp: 'Dem Blatt „Probennotizen“ fehlen Spalten. Auf der Seite „Tabelle einrichten“ werden sie ergänzt.',
	gone: 'Notizen gibt es nur für Proben, die schon begonnen haben.',
	home: (date: string) => `Aus der Probe am ${date}`
} as const;
