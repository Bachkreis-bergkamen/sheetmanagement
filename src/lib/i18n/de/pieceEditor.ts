export const pieceEditor = {
	/** Next to "Weitere Angaben": how many of the fields under it hold something (#185). */
	filled: (count: number) => (count === 1 ? '1 ausgefüllt' : `${count} ausgefüllt`),
	/** A field a suggestion filled, until someone has looked at it. */
	suggested: (source: string) => `Vorschlag (${source}) – stimmt das?`,
	confirm: 'Passt',
	undo: 'Rückgängig',
	unchecked: (count: number) => (count === 1 ? '1 übernommener Vorschlag ist noch nicht geprüft.' : `${count} übernommene Vorschläge sind noch nicht geprüft.`),
	/** The length of the video linked as Hörbeispiel, asked once the link is in (#133). */
	videoLength: (length: string) => `Das Video dauert ${length}.`,
	useVideoLength: 'Als Dauer übernehmen',
	title: (piece: string) => `Bearbeiten: ${piece}`,
	lead: 'Was hier steht, gilt statt dem Ordnernamen.',
	recordingHint: 'Link zu einer Aufnahme, z. B. YouTube',
	/** Writes the sheet's word for "no recording" into the field. */
	noRecording: 'Gibt es keins',
	noRecordingHint: 'Für Stücke ohne Aufnahme: „Angaben ergänzen“ fragt dann nicht mehr danach.',
	reviewedHint: 'z. B. 2026-10-18',
	today: 'Heute',
	save: 'Speichern',
	cancel: 'Abbrechen',
	conflict: 'Jemand hat das Stück inzwischen geändert. Lade die Seite neu und mach deine Änderung noch einmal.',
	notInSheet: 'Noch nicht in der Tabelle. Neue Ordner kommen innerhalb einer Minute dazu.',
	renamed: (n: number) => (n === 1 ? 'Der neue Titel wurde auch in 1 Programm übernommen.' : `Der neue Titel wurde auch in ${n} Programmen übernommen.`),
	problems: {
		'title-missing': 'Bitte einen Titel angeben.',
		'title-taken': 'Diesen Titel hat schon ein anderes Stück. Programme finden Stücke über den Titel, er muss eindeutig sein.',
		'bad-link': 'Das Hörbeispiel muss ein Link sein, der mit http:// oder https:// beginnt, oder „keins“.',
		'bad-duration': 'Die Dauer ist nicht lesbar. Möglich sind z. B. 7:30, 7 Min. oder 1:02:00.'
	},
	durationHint: 'z. B. 7:30',
	composerHint: 'mehrere mit Komma: Mozart, Haydn',
	composerFullHint: 'z. B. Ludwig van Beethoven – für die GEMA-Meldung',
	/** Medleys and suites: one song per line, the composers come from there. */
	contentsHint: 'Bei Medleys und Suiten: ein Titel pro Zeile, z. B. Habanera – Bizet',
	contentsLead: 'Jeder Titel wird in der Suche gefunden. Bleibt „Komponist“ leer, stehen dort die Komponisten aus dem Inhalt, gekürzt auf zwei und „und mehr“.',
	composerFromContents: (names: string) => `aus dem Inhalt: ${names}`,
	/** Empties "Komponist" so it follows the contents. */
	useContentsComposers: 'Aus dem Inhalt nehmen',
	useContentsComposersHint: 'Leert das Feld: Die Komponisten kommen dann aus dem Inhalt und bleiben kurz.',
	listHint: 'mehrere mit Komma trennen',
	publisherHint: 'z. B. Bärenreiter – für die GEMA-Meldung',
	unreadInstrumentation: (text: string) => `Nicht als Instrument erkannt, bleibt so stehen: ${text}`,
	missingColumns: (columns: string) => `${columns}: Die Spalten fehlen noch in der Tabelle. Einmal „Tabelle einrichten“ ausführen, dann lassen sie sich hier eintragen.`
} as const;
