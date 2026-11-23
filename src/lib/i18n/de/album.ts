/** Photos and impressions (#66): the album, one album's page, adding photos, approving them. */
export const album = {
	title: 'Fotos & Eindrücke',
	lead: 'Fotos und Erinnerungen von Konzerten, Proben und Fahrten, bis zurück zur Gründung. Neue Fotos erscheinen, sobald sie freigegeben sind.',
	notSetUp: 'Das Fotoalbum ist noch nicht eingerichtet: Es braucht die Datenbank (D1) und einen Speicher für Bilder (R2).',
	membersOnly: 'Fotos sehen nur angemeldete Mitglieder.',
	/** Per album, singular. */
	kind: { konzert: 'Konzert', probe: 'Probe', fahrt: 'Fahrt', sonstiges: 'Album' } as Record<string, string>,
	/** The filter, plural. */
	kinds: { konzert: 'Konzerte', probe: 'Proben', fahrt: 'Fahrten', sonstiges: 'Sonstiges' } as Record<string, string>,
	all: 'Alle',
	allYears: 'Alle Jahre',
	filterKind: 'Art',
	filterYear: 'Jahr',
	decades: 'Jahrzehnte',
	years: 'Jahre',
	empty: 'Noch keine Fotos. Füge die ersten hinzu!',
	emptyFiltered: 'Keine Fotos für diese Auswahl.',
	photos: (n: number) => (n === 1 ? '1 Foto' : `${n} Fotos`),
	comments: (n: number) => (n === 1 ? '1 Kommentar' : `${n} Kommentare`),
	add: 'Fotos hinzufügen',
	videos: (n: number) => (n === 1 ? '1 Aufnahme' : `${n} Aufnahmen`),
	waiting: (n: number) => (n === 1 ? '1 Beitrag wartet auf Freigabe' : `${n} Beiträge warten auf Freigabe`),

	/** /fotos/neu: what the photos belong to. */
	pick: {
		title: 'Fotos hinzufügen',
		lead: 'Wozu gehören die Fotos? Ein Konzert aus dem Archiv, eine Probe, eine Fahrt, oder ein eigenes Album für alles andere.',
		search: 'Suchen: Titel oder Jahr',
		none: 'Nichts gefunden.',
		more: (n: number) => `${n} weitere: Such nach Titel oder Jahr, um sie zu finden.`,
		ownTitle: 'Eigenes Album anlegen',
		ownLead: 'Für alles, was weder im Kalender noch im Archiv steht: ein Sommerfest, ein Ausflug, alte Fotos aus den Anfängen.',
		name: 'Titel',
		nameHint: 'Sommerfest im Pfarrgarten',
		year: 'Jahr',
		month: 'Monat',
		day: 'Tag',
		optional: 'optional',
		noMonth: '–',
		create: 'Album anlegen',
		badName: (max: number) => `Bitte gib dem Album einen Titel mit höchstens ${max} Zeichen.`,
		badDate: (first: number) => `Bitte ein Datum zwischen ${first} und heute angeben; den Tag nur zusammen mit dem Monat.`
	},

	/** One album: /fotos/termin/<id>, /fotos/fahrt/<id>, /fotos/album/<id>. */
	page: {
		toEvent: 'Zum Termin',
		toTrip: 'Zur Fahrt',
		toAlbum: 'Alle Fotos',
		noPhotos: 'Noch keine Fotos in diesem Album.',
		pending: 'Wartet auf Freigabe',
		public: 'Auf der Website',
		by: (name: string) => `Von ${name}`,
		open: (n: number, of: number) => `Foto ${n} von ${of} vergrößern`,
		close: 'Schließen',
		previous: 'Vorheriges Foto',
		next: 'Nächstes Foto',
		remove: 'Foto entfernen',
		removeConfirm: 'Dieses Foto wirklich entfernen? Das lässt sich nicht rückgängig machen.',
		removed: 'Foto entfernt.',
		download: 'Original öffnen'
	},

	upload: {
		title: 'Fotos hochladen',
		lead: 'Bitte nur Fotos von Menschen, die damit einverstanden sind. Die Fotos werden auf deinem Gerät verkleinert, Ortsangaben dabei entfernt.',
		leadPending: 'Sie erscheinen, sobald sie freigegeben sind.',
		choose: 'Fotos auswählen',
		caption: 'Bildunterschrift',
		captionHint: 'gilt für alle ausgewählten Fotos, optional',
		preparing: 'Fotos werden vorbereitet …',
		ready: (n: number) => (n === 1 ? '1 Foto bereit' : `${n} Fotos bereit`),
		send: (n: number) => (n === 1 ? '1 Foto hochladen' : `${n} Fotos hochladen`),
		clear: 'Auswahl leeren',
		unreadable: (name: string) => `„${name}“ ließ sich nicht öffnen und wird übersprungen.`,
		sent: (n: number) => (n === 1 ? 'Foto hochgeladen. Es erscheint nach der Freigabe.' : `${n} Fotos hochgeladen. Sie erscheinen nach der Freigabe.`),
		sentApproved: (n: number) => (n === 1 ? 'Foto hochgeladen.' : `${n} Fotos hochgeladen.`),
		notOpen: 'Fotos können hinzugefügt werden, sobald der Termin begonnen hat.'
	},

	/** Recordings (#408): unlisted YouTube videos. */
	video: {
		title: 'Aufnahmen',
		lead: 'Mitschnitte und Filme als „nicht gelistete“ YouTube-Videos: Nur wer den Link hat, kann sie abspielen, und hier sehen ihn nur angemeldete Mitglieder. Nie auf der Website.',
		none: 'Noch keine Aufnahmen.',
		add: 'Aufnahme hinzufügen',
		link: 'YouTube-Link',
		linkHint: 'Auf YouTube als „Nicht gelistet“ hochladen (nicht „Privat“: das lässt sich hier nicht abspielen), dann den Link hier einfügen.',
		name: 'Titel',
		nameHint: 'Mitschnitt des ganzen Konzerts',
		pieces: 'Welche Stücke sind darin?',
		piecesHint: 'Wo beginnt jedes, etwa 12:30? Leer lassen, was nicht darin ist; 0:00 für den Anfang.',
		suggest: 'Aufnahme vorschlagen',
		save: 'Aufnahme hinzufügen',
		sent: 'Aufnahme vorgeschlagen. Sie erscheint nach der Freigabe.',
		sentApproved: 'Aufnahme hinzugefügt.',
		by: (name: string) => `Von ${name}`,
		remove: 'Aufnahme entfernen',
		removeConfirm: 'Diese Aufnahme aus dem Album entfernen? Das Video auf YouTube bleibt.',
		removed: 'Aufnahme entfernt.'
	},

	talk: {
		title: 'Eindrücke',
		label: 'Dein Kommentar',
		hint: 'Wie war’s? Was bleibt in Erinnerung?',
		post: 'Kommentieren',
		none: 'Noch keine Kommentare.',
		remove: 'Kommentar löschen',
		removeConfirm: 'Diesen Kommentar wirklich löschen?'
	},

	/** /fotos/freigabe, for those with "fotos.freigeben". */
	approval: {
		title: 'Fotos freigeben',
		lead: 'Was Mitglieder hochgeladen haben. Freigegebene Fotos sehen alle Mitglieder. Auf die Website kommt ein Foto nur, wenn du es dafür freigibst.',
		empty: 'Nichts wartet auf Freigabe.',
		approve: 'Freigeben',
		approvePublic: 'Auch für die Website',
		reject: 'Ablehnen',
		rejectConfirm: 'Dieses Foto ablehnen? Es wird gelöscht.',
		approved: 'Freigegeben.',
		rejected: 'Abgelehnt und gelöscht.',
		notShown: (names: string) => `Ohne Fotoerlaubnis: ${names}. Fotos mit ihnen nicht auf die Website.`,
		consentHint: 'Vor der Website: Haben alle, die zu sehen sind, zugestimmt? Wer zugestimmt hat, steht unter Fotoerlaubnis.',
		videos: 'Aufnahmen',
		storage: (used: string, budget: string) => `Speicher für Fotos: ${used} von ${budget} belegt`,
		storageHint: 'Cloudflare R2 ist bis 10 GB kostenlos. Das Album nimmt nur bis zu dieser Grenze Fotos an, damit keine Kosten entstehen.',
		makePublic: 'Auf die Website',
		makePrivate: 'Von der Website nehmen',
		uploaded: (name: string, when: string) => `${name}, ${when}`
	},

	problems: {
		noFiles: 'Bitte wähle mindestens ein Foto aus.',
		tooMany: (max: number) => `Höchstens ${max} Fotos auf einmal.`,
		badFile: 'Eine Datei ist kein Foto (JPEG, PNG oder WebP) oder zu groß.',
		caption: (max: number) => `Die Bildunterschrift ist zu lang, höchstens ${max} Zeichen.`,
		comment: (max: number) => `Bitte schreib einen Kommentar mit höchstens ${max} Zeichen.`,
		notOpen: 'Zu diesem Termin können noch keine Fotos hinzugefügt werden.',
		gone: 'Das gibt es nicht mehr.',
		badLink: 'Das ist kein YouTube-Link.',
		videoTitle: (max: number) => `Bitte gib der Aufnahme einen Titel mit höchstens ${max} Zeichen.`,
		badStart: (piece: string) => `Die Startzeit bei „${piece}“ verstehe ich nicht; bitte etwa 12:30.`,
		full: (budget: string) => `Der Speicher für Fotos ist voll (${budget}), damit das Album kostenlos bleibt. Die Leitung kann alte Fotos löschen.`,
		daily: (n: number) => `Heute sind schon ${n} Fotos von dir dazugekommen, mehr geht erst morgen.`,
		waiting: (n: number) => `Von dir warten schon ${n} Fotos auf Freigabe. Sobald sie freigegeben sind, geht es weiter.`,
		notYours: 'Das darfst du nicht entfernen.',
		failed: 'Das hat nicht geklappt. Bitte versuch es noch einmal.'
	},

	/** In "Meine Daten herunterladen". */
	exported: {
		photos: 'Hochgeladene Fotos',
		comments: 'Kommentare im Fotoalbum',
		videos: 'Vorgeschlagene Aufnahmen',
		link: 'Link',
		album: 'Album',
		caption: 'Bildunterschrift',
		status: 'Stand',
		uploaded: 'Hochgeladen',
		text: 'Text',
		written: 'Geschrieben',
		statuses: { pending: 'wartet auf Freigabe', approved: 'freigegeben' } as Record<string, string>
	},
	/** In "Mitglied löschen". */
	erased: 'Fotos, Aufnahmen und Kommentare im Fotoalbum (Fotos und Aufnahmen bleiben ohne Namen, Kommentare werden gelöscht)'
} as const;
