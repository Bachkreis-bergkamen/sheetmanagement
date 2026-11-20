export const myParts = {
	title: 'Meine Noten',
	lead: 'Deine Stimmen, in Programmreihenfolge.',
	empty: 'Nach der Anmeldung findest du hier deine Stimmen für jedes Konzert.',
	wholeProgram: 'Noch kein Probenplan, deshalb das ganze Programm.',
	concert: 'Konzert',
	jumpTo: 'Springen zu',
	more: (n: number) => (n === 1 ? 'Noch 1 Konzert' : `Noch ${n} Konzerte`),
	instrument: 'Instrument',
	number: 'Stimme',
	anyNumber: 'alle',
	pickInstrument: 'Was spielst du? Einmal auswählen, dann sind deine Noten immer hier.',
	unknownInstrument: (text: string) => `„${text}“ kennt die App nicht als Instrument. Bitte einmal auswählen.`,
	save: 'Merken',
	saved: 'Gemerkt.',
	change: 'Ändern',
	show: 'Anzeigen',
	noConcert: 'Gerade steht kein Konzert mit Programm an.',
	noProgram: 'Für dieses Konzert ist noch kein Programm eingetragen.',
	shared: 'Gemeinsame Stimme',
	/** The button that opens a part: what the tap does, not just the instrument (#223). */
	open: (part: string) => `${part} öffnen`,
	noPart: (instrument: string) => `Keine Stimme für ${instrument}`,
	noMusic: 'Keine Noten im Archiv',
	missing: 'fehlt im Archiv',
	summary: (found: number, total: number) => `${found} von ${total} Stücken mit Stimme`,
	merge: 'Als eine PDF',
	/** Which of their parts someone plays at one concert: Geige I or Geige II, not both. */
	playing: {
		label: 'Im Konzert spielst du',
		inPiece: (piece: string) => `Deine Stimme in ${piece}`,
		forAll: 'Gilt für alle Stücke; einzelne Stücke stellst du unten um.',
		all: 'Alle',
		allHint: 'Alle deine Stimmen zeigen',
		pick: (part: string) => `Nur ${part} zeigen`,
		yes: 'Gilt zugleich als Zusage.',
		saved: 'Gemerkt, auch bei deiner Antwort zum Konzert.',
		failed: 'Diese Stimme steht nicht bei deinen Instrumenten.'
	},
	/** Playing a concert from a tablet (#194). */
	concertMode: {
		open: 'Auftrittsmodus',
		hint: 'Deine Stimmen in Programmfolge im Vollbild. Blättern mit Tippen oder Pedal geht gleich ins nächste Stück, der Bildschirm bleibt an.',
		title: 'Auftrittsmodus',
		piece: 'Stück',
		night: 'Nacht'
	},
	merging: (done: number, total: number) => `Lade Stimme ${done} von ${total} …`,
	mergeFailed: 'Die PDF konnte nicht erstellt werden. Die einzelnen Stimmen lassen sich weiter öffnen.',
	skipped: (n: number) =>
		n === 1 ? 'Eine Stimme fehlt in der PDF, sie ließ sich nicht laden:' : `${n} Stimmen fehlen in der PDF, sie ließen sich nicht laden:`,
	skipOffline: 'keine Verbindung',
	skipHttp: (status: number, text: string) => (status === 403 ? 'nicht angemeldet' : `Fehler ${status}${text ? ` – ${text.slice(0, 120)}` : ''}`),
	skipUnreadable: 'die Datei ist keine lesbare PDF',
	mergeHint: 'Fügt deine Stimmen in Programmreihenfolge zu einer Datei zusammen, zum Drucken oder fürs Tablet.',
	mergeOff: 'Das Zusammenfügen geht nur mit Anmeldung.',
	pickInstruments: 'Was spielst du? Einmal auswählen, dann sind deine Noten immer hier.',
	paused: (until?: string) =>
		until ? `Du bist bis ${until} pausiert. Deine Noten siehst du trotzdem.` : 'Du bist gerade pausiert. Deine Noten siehst du trotzdem.',
	inactive: 'Du bist als inaktiv eingetragen. Deine Noten siehst du trotzdem.',
	profileHint: 'Ändern lässt sich das auch im Profil.'
} as const;
