export const piece = {
	details: 'Details',
	/** The member's own parts at the top of the page (#216). */
	yourPart: (part: string) => `Deine Stimme: ${part}`,
	alsoPart: (part: string) => `Auch: ${part}`,
	yours: 'deine',
	reportedMissing: 'Als fehlend gemeldet',
	reportedMissingHint: 'Gemeldet, aber noch nicht bestätigt. Nach der Bestätigung steht ein Platzhalter im Ordner.',
	folder: 'Drive-Ordner',
	editShort: 'Bearbeiten',
	reportShort: 'Melden',
	/** Over the one card with all parts. */
	partsTitle: 'Stimmen',
	/** The side column: upcoming dates, where it was played, related pieces. */
	about: 'Zum Stück',
	upcoming: 'Demnächst',
	recording: 'Hörbeispiel',
	edit: 'Angaben bearbeiten',
	saved: 'Gespeichert.',
	groups: {
		featured: 'Partitur & Solo',
		holz: 'Holzbläser',
		blech: 'Blechbläser',
		schlagwerk: 'Schlagwerk',
		tasten: 'Tasten & Harfe',
		gesang: 'Gesang',
		streicher: 'Streicher',
		sonstige: 'Stimmen für alle',
		other: 'Weitere Dateien'
	},
	partStatus: {
		ok: '',
		missing: 'fehlt',
		empty: 'leer',
		incomplete: 'Seiten fehlen'
	},
	missingSummary: (n: number) =>
		n === 1 ? '1 Stimme fehlt, ist leer oder es fehlen Seiten.' : `${n} Stimmen fehlen, sind leer oder es fehlen Seiten.`,
	playedAt: 'Gespielt bei',
	sections: 'Fassungen',
	playedBadge: 'gespielt',
	sectionHint: {
		played: 'Die Stimmen, die gespielt werden.',
		complete: 'Das komplette Werk, zum Nachschlagen.',
		movement: '',
		other: ''
	},
	sectionFolder: 'Diesen Ordner in Google Drive',
	otherVersions: 'Weitere Fassungen dieses Werks',
	moreBy: (composer: string) => `Weitere Werke von ${composer}`,
	/** A medley's songs, from "Inhalt". */
	contents: 'Inhalt',
	contentsCount: (n: number) => (n === 1 ? '1 Titel' : `${n} Titel`),
	/** Opens the rest of a shortened composer line. */
	allComposers: (n: number) => `alle ${n} Komponisten`,
	/** "Weitere Werke von …" for a medley: by any of its composers. */
	moreByAny: 'Weitere Werke dieser Komponisten',
	again: 'Wieder spielen',
	againMine: 'Möchte ich wieder spielen',
	againHint: 'Zeigt der Programmplanung, dass du das Stück gern wieder spielen würdest. Nochmal klicken nimmt es zurück.',
	againPlanned: 'Ist für ein Programm vorgemerkt.',
	allBy: (composer: string) => `Alle Werke von ${composer}`,
	playedAtNone: 'Noch in keinem Konzert eingetragen.',
	playedAtNoSheet: 'Erscheint, sobald die Repertoire-Tabelle eingerichtet ist.',
	noMusic: 'Keine Noten im Archiv, nur in der Tabelle eingetragen.',
	info: {
		duration: 'Dauer',
		publisher: 'Verlag',
		arranger: 'Arrangement',
		genre: 'Genre',
		difficulty: 'Schwierigkeit',
		reviewedAt: 'Geprüft am',
		notes: 'Notiz'
	},
	driveHint: 'Öffnet sich in Google Drive (Zugriff auf den Noten-Ordner nötig).',
	portrait: (name: string) => `Porträt von ${name}`,
	portraitCredit: 'Bild: Wikimedia Commons',
	/** A film's title logo or an icon for it (#312). */
	filmPicture: (film: string) => `Bild zum Film ${film}`,
	musicalPicture: (musical: string) => `Bild zum Musical ${musical}`,
	bandPicture: (band: string) => `Logo von ${band}`,
	iconCredit: 'Icon: Iconify'
} as const;
