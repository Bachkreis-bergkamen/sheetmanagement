/** Allowing notifications on /profil (#157). */
export const push = {
	title: 'Benachrichtigungen',
	lead: 'Erinnert dich auf diesem Gerät an Proben und Konzerte, auf die du noch nicht geantwortet hast, und sagt Bescheid, wenn deine Wünsche eine Antwort bekommen. Wer Leihmaterial betreut oder die App verwaltet, hört auch von Rückgaben, neuen Wünschen und Störungen.',
	enable: 'Benachrichtigungen erlauben',
	disable: 'Ausschalten',
	test: 'Test senden',
	on: 'Auf diesem Gerät an.',
	elsewhere: (n: number) => (n === 1 ? 'Auf 1 anderen Gerät an.' : `Auf ${n} anderen Geräten an.`),
	denied: 'Benachrichtigungen sind für diese Seite blockiert. Erlaube sie in den Website-Einstellungen des Browsers.',
	unsupported: 'Dieser Browser kann keine Benachrichtigungen empfangen.',
	installFirst: 'Auf iPhone und iPad gehen Benachrichtigungen erst, wenn die App auf dem Home-Bildschirm liegt (Teilen → „Zum Home-Bildschirm“).',
	failed: 'Das hat nicht geklappt. Bitte versuch es noch einmal.',
	testTitle: 'Test',
	testBody: 'So sehen Erinnerungen auf diesem Gerät aus.',
	testSent: 'Gesendet. Kommt nichts an, prüfe die Mitteilungen in den Einstellungen des Geräts.',
	hint: 'Gilt für dieses Gerät. Beim Abmelden geht es hier aus.'
} as const;
