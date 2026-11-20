export const home = {
	title: (orchestra: string) => `Notenarchiv des ${orchestra}`,
	hello: (name: string) => `Hallo ${name}`,
	upNext: 'Als Nächstes',
	details: 'Details',
	allDates: 'Alle Termine',
	nextConcert: 'Nächstes Konzert',
	nextConcertEmpty: 'Sobald der Kalender verbunden ist, steht hier das nächste Konzert mit Programm.',
	noNextConcert: 'Gerade ist kein Konzert im Kalender eingetragen.',
	program: 'Programm',
	pieces: (n: number) => (n === 1 ? '1 Stück' : `${n} Stücke`),
	morePieces: (n: number) => `+ ${n} weitere`,
	nextRehearsal: 'Nächste Probe',
	/** Over the answer buttons docked above the tab bar: "Bist du am Samstag dabei?". */
	areYouIn: (day: string) => `Bist du am ${day} dabei?`,
	/** The dates after the next one. */
	later: 'Danach',
	/** After "Antwort fehlt" on a later date: opens it to answer. */
	answerNow: 'Jetzt antworten',
	quickLinks: 'Alle Bereiche',
	work: 'Aufgaben im Orchester',
	/** In the greeting: the next concert, "Herbstkonzert in 25 Tagen" (#221). */
	countdown: (concert: string, when: string) => `${concert} ${when}`,
	todo: {
		title: 'Wartet auf dich',
		/** All open work as one row after its count ("6 Dinge warten auf dich"); it opens to the list (#220). */
		summary: (n: number) => (n === 1 ? 'Sache wartet auf dich' : 'Dinge warten auf dich'),
		reports: (n: number) => (n === 1 ? 'offene Meldung' : 'offene Meldungen'),
		wishes: (n: number) => (n === 1 ? 'offener Wunsch' : 'offene Wünsche'),
		requests: (n: number) => (n === 1 ? 'Zugangsanfrage' : 'Zugangsanfragen'),
		loans: (n: number) => (n === 1 ? 'Rückgabe steht an' : 'Rückgaben stehen an'),
		attendance: (n: number) => (n === 1 ? 'Probe ohne Anwesenheit' : 'Proben ohne Anwesenheit'),
		polls: (n: number) => (n === 1 ? 'Terminumfrage' : 'Terminumfragen'),
		scans: (n: number) => (n === 1 ? 'Stimme zum Scannen' : 'Stimmen zum Scannen')
	},
	/** One line under each page on the start page. */
	describe: {
		'/meine-noten': 'Deine Stimmen fürs nächste Konzert.',
		'/kalender': 'Proben und Konzerte.',
		'/chronik': 'Alle Konzerte seit den Anfängen, in Zahlen.',
		'/ueben': 'Noten lesen, Tonarten, Töne treffen: ein paar Minuten am Tag.',
		'/profil': 'Instrument, Orchester, eigener Kalender.',
		'/stuecke': 'Alle Stücke mit allen Stimmen.',
		'/stuecke/angaben': 'Fehlende Angaben zu Stücken ergänzen.',
		'/fehlende-stimmen': 'Lücken im Archiv.',
		'/namen': 'Dateinamen in die Konvention bringen.',
		'/wuensche': 'Stücke und Ideen vorschlagen.',
		'/meldungen': 'Gemeldete Probleme bearbeiten.',
		'/leihmaterial': 'Geliehene Noten und wann sie zurückmüssen.',
		'/admin': 'Mitglieder, Rollen und Anfragen.',
		'/einstellungen': 'Orchester, Tabelle und Daten, Status.',
		'/termine': 'Termine mit dem Orga-Team abstimmen.',
		'/ensembles': 'Chöre und Orchester, mit denen wir auftreten.'
	} as Record<string, string>
} as const;
