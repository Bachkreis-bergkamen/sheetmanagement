export const erase = {
	anonymous: 'Ehemaliges Mitglied',
	button: 'Alle Daten löschen …',
	title: (name: string) => `Alle Daten von ${name} löschen`,
	lead: 'Für eine Bitte um Löschung (Art. 17 DSGVO). Was nur diese Person betrifft, wird gelöscht. Wo eine Zeile auch für andere zählt (Zusagen, Anwesenheit, +1, Hinweise), bleibt sie ohne Namen stehen, damit Zählungen und Saisonbericht stimmen.',
	nothing: 'Außer der Zeile in „Mitglieder“ gibt es keine Daten zu dieser Person.',
	remove: (count: number) => (count === 1 ? '1 Eintrag wird gelöscht' : `${count} Einträge werden gelöscht`),
	anonymise: (count: number) => (count === 1 ? '1 Eintrag bleibt ohne Namen' : `${count} Einträge bleiben ohne Namen`),
	confirm: 'Endgültig löschen',
	confirmQuestion: (name: string) => `Alle Daten von ${name} endgültig löschen? Das lässt sich nicht rückgängig machen.`,
	done: (name: string) => `Die Daten von ${name} sind gelöscht.`,
	failed: 'Das Löschen hat nicht ganz geklappt. Was erledigt ist, bleibt erledigt; bitte noch einmal versuchen.',
	stored: {
		devices: 'Geräte für Benachrichtigungen',
		reminders: 'Verschickte Erinnerungen',
		settings: 'Einstellungen (E-Mails, Tour, Übezeit)',
		practice: 'Übezeit (Tage)',
		drills: 'Übebereich (Fortschritt, geteilter Übestand, Zustimmung der Eltern)',
		marks: 'Eigene Eintragungen in Noten (Seiten)',
		polls: 'Terminumfragen',
		trips: 'Fahrten (Anmeldungen, Listen und Instrumente gelöscht, Organisation ohne Namen)',
		kummer: 'Kummerkasten (eigene Nachrichten gelöscht, Antworten ohne Namen)'
	}
} as const;
