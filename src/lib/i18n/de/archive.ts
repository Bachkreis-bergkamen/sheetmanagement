export const archive = {
	addPiece: 'Stück ohne Noten eintragen',
	addPieceLead: 'Für gespielte Stücke ohne Noten im Archiv.',
	addWithMusic: 'Stück mit Noten anlegen',
	addWithMusicLead: 'Trägt das Stück ein und legt seinen Ordner im Notenarchiv an, mit dem Namen nach der Konvention. Danach gleich die PDFs hochladen.',
	addWithMusicSave: 'Anlegen und Noten hochladen',
	orchestra: 'Orchester',
	pieceTitle: 'Titel',
	composer: 'Komponist',
	catalogue: 'Werkverzeichnis',
	add: 'Eintragen',
	failed: 'Die Tabelle konnte gerade nicht geändert werden. Bitte versuch es noch einmal.',
	problems: {
		'title-missing': 'Bitte einen Namen angeben.',
		'title-taken': 'Diesen Titel gibt es schon. Programme finden Stücke über den Titel, er muss eindeutig sein.',
		'day-taken': 'An diesem Tag gibt es schon ein Konzert mit diesem Namen. Derselbe Name an einem anderen Tag geht.',
		'bad-date': 'Das Datum ist nicht lesbar. Möglich sind 21.12.1957, 12.1957 oder 1957.'
	},
	editConcert: 'Archiveintrag bearbeiten',
	editConcertLead: 'Name, Tag, Ort und Orchester. Programm, Hinweise und Wünsche bleiben bei diesem Konzert.',
	concertTitle: 'Anlass',
	date: 'Datum',
	dateHint: 'TT.MM.JJJJ, nur Monat (12.1957) oder Jahr (1957)',
	location: 'Ort',
	save: 'Speichern',
	saved: 'Gespeichert.'
} as const;
