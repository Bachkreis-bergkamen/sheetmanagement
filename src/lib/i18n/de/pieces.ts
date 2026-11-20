export const pieces = {
	title: 'Notenarchiv',
	lead: 'Alle Stücke mit allen Stimmen.',
	empty: 'Sobald Google Drive verbunden ist, erscheinen hier alle Stücke aus dem Notenarchiv.',
	failed: 'Das Notenarchiv konnte gerade nicht geladen werden. Versuch es gleich noch einmal.',
	loading: 'Das Notenarchiv wird gerade aus Drive eingelesen. Das dauert bis zu zehn Minuten; schau dann noch einmal vorbei.',
	checkStatus: 'Verbindung prüfen',
	search: 'Archiv filtern: Titel, Komponist, Stimme, Notiz …',
	searchLabel: 'Archiv filtern',
	needsWork: 'Mit Lücken',
	/** No conductor's score in the archive, beside the other status. */
	noScore: 'Partitur fehlt',
	noMusic: 'Ohne Noten',
	byComposer: (composer: string) => `Werke von ${composer}`,
	clearComposer: 'Komponisten-Filter entfernen',
	categoryFiles: 'Dateien zu dieser Kategorie',
	count: (n: number) => (n === 1 ? '1 Stück' : `${n} Stücke`),
	parts: (n: number) => (n === 1 ? '1 Stimme' : `${n} Stimmen`),
	noResults: 'Nichts gefunden.',
	clearSearch: 'Suche leeren',
	// Found not by the title but by a part or a note on the piece.
	foundParts: (instruments: string) => `Stimme: ${instruments}`,
	foundNote: (excerpt: string) => `Notiz: ${excerpt}`,
	/** Found by one of a medley's songs ("Inhalt"). */
	foundSong: (song: string) => `Enthält: ${song}`,
	/** After the first two composers of a medley: "Bizet, Offenbach und mehr". */
	moreComposers: 'und mehr',
	filter: 'Filter',
	filterGroups: { mine: 'Für mich', programs: 'Orchester', categories: 'Genre', difficulty: 'Schwierigkeit', length: 'Dauer', state: 'Zustand' },
	lengths: { kurz: 'Bis 5 Min.', mittel: '5–10 Min.', lang: 'Über 10 Min.' },
	myPart: 'Mit meiner Stimme',
	assigned: 'Mir zugeteilt',
	coming: 'In kommenden Konzerten',
	withRecording: 'Mit Hörbeispiel',
	status: {
		ok: '',
		missing: 'Stimmen fehlen',
		// Pages missing inside a part's PDF (UNVOLLSTÄNDIG in the file name), not a missing part.
		incomplete: 'Seiten fehlen',
		empty: 'Keine Noten',
		none: 'Nicht im Archiv'
	}
} as const;
