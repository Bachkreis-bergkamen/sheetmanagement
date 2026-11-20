/** The personal calendar feed (#122), on /profil and in the feed itself. */
export const feed = {
	title: 'Termine im eigenen Kalender',
	lead: 'Alle Termine in deiner Kalender-App, mit deiner Antwort (✓ ? ✗) und was geprobt wird.',
	create: 'Kalender-Link erzeugen',
	subscribe: 'Im Kalender abonnieren',
	copy: 'Link kopieren',
	copied: 'Kopiert',
	renew: 'Neuen Link erzeugen',
	revoke: 'Link sperren',
	confirmRenew: 'Neuen Link erzeugen? Kalender, die den alten abonniert haben, bekommen dann keine Termine mehr.',
	confirmRevoke: 'Link sperren? Kalender, die ihn abonniert haben, bekommen dann keine Termine mehr.',
	hint: 'Persönlich, nicht weitergeben. Google Kalender: Weitere Kalender → Per URL.',
	notSetUp: 'Noch nicht eingerichtet. Die Verwaltung muss einmal „Tabelle einrichten“ ausführen.',
	failed: 'Der Link konnte gerade nicht gespeichert werden. Bitte versuch es noch einmal.',
	program: 'Programm:',
	rehearsed: 'Geprobt:',
	answer: (answer: string) => `Deine Antwort: ${answer}`,
	details: 'Details:',
	parts: 'Deine Noten:',
	calendarName: (orchestra: string) => `${orchestra} · Termine`,
	/** The concerts for the orchestra's website (#197). */
	publicCalendarName: (orchestra: string) => `${orchestra} · Konzerte`,
	publicProgram: 'Programm:'
} as const;
