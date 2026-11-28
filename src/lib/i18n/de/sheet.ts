/**
 * Tab and column names of the Repertoire sheet. The app finds columns by these
 * headers, so columns may be reordered or added in the sheet. Renaming one here
 * means renaming it in existing sheets too.
 */
export const sheet = {
	pieces: {
		tab: 'Stücke',
		columns: {
			title: 'Titel',
			composer: 'Komponist',
			/** "Ludwig van Beethoven" where "Komponist" says "Beethoven": for the GEMA list (#146). */
			composerFull: 'Komponist (voll)',
			catalogue: 'Werkverzeichnis',
			arranger: 'Arrangeur',
			genre: 'Genre',
			difficulty: 'Schwierigkeit',
			notes: 'Notiz',
			reviewedAt: 'Geprüft am',
			recording: 'Hörbeispiel',
			/** "7:30"; adds up to the programme's length (#117). */
			duration: 'Dauer',
			/** For the GEMA music list (#118). */
			publisher: 'Verlag',
			/** The instruments the score is written for, "Flöte 1 & 2; Oboe; Geige 1 & 2" (#249). */
			instrumentation: 'Besetzung',
			/** A medley's songs, one per line: "Habanera – Bizet". */
			contents: 'Inhalt',
			/** Background for the Moderation and the Programmheft (#411): where it comes from, stories about it. */
			facts: 'Wissenswertes',
			driveFolderId: 'Drive-Ordner-ID'
		}
	},
	concerts: {
		tab: 'Konzerte',
		columns: {
			date: 'Datum',
			title: 'Anlass',
			location: 'Ort',
			orchestra: 'Orchester',
			/** Another concert's "Anlass": this one plays the same programme (#70). */
			sameProgramAs: 'Programm wie',
			eventId: 'Kalender-Event-ID',
			/** Guest choirs and orchestras by "Kurzname" from "Ensembles", or by their full name. */
			partners: 'Mitwirkende',
			/** Empty: we organise and sell the tickets; else the ensemble (or anyone) who does. */
			organizer: 'Veranstalter'
		}
	},
	program: {
		tab: 'Programm',
		columns: {
			concert: 'Konzert',
			position: 'Nr.',
			piece: 'Stück',
			notes: 'Notiz',
			/** Which of the concert's orchestras plays it; empty: all of them together. Guests by their "Kurzname". */
			orchestra: 'Orchester',
			/** For pieces the guests bring, which aren't in "Stücke": what the GEMA list needs. */
			composer: 'Komponist',
			arranger: 'Arrangeur',
			publisher: 'Verlag',
			duration: 'Dauer'
		}
	},
	/** Choirs and orchestras we play with: named under "Mitwirkende" in "Konzerte". */
	ensembles: {
		tab: 'Ensembles',
		columns: {
			shortName: 'Kurzname',
			name: 'Name',
			/** "Chor", "Orchester" …: shown before the name on the website. */
			kind: 'Art',
			conductor: 'Leitung',
			website: 'Website',
			/** A link to the logo image; only https. */
			logo: 'Logo'
		}
	},
	members: {
		tab: 'Mitglieder',
		columns: {
			email: 'E-Mail',
			name: 'Name',
			instrument: 'Instrument',
			groups: 'Gruppen',
			orchestras: 'Orchester',
			status: 'Status',
			pausedUntil: 'Pausiert bis',
			linkVersion: 'Link-Version',
			/** The personal calendar feed (#122): like "Link-Version", a new link ends the old one. */
			feedVersion: 'Kalender-Version',
			/** For a parent account: their children among the members, by name or email. */
			children: 'Kinder',
			/** More addresses the member signs in with (#190), e.g. the school's and a private one. */
			aliases: 'Weitere Adressen'
		}
	},
	groups: {
		tab: 'Gruppen',
		columns: {
			name: 'Gruppe',
			description: 'Beschreibung'
		}
	},
	rights: {
		tab: 'Rechte',
		columns: {
			who: 'Wer',
			right: 'Recht'
		}
	},
	requests: {
		tab: 'Zugangsanfragen',
		columns: {
			email: 'E-Mail',
			name: 'Name',
			requestedAt: 'Angefragt am'
		}
	},
	reports: {
		tab: 'Meldungen',
		columns: {
			piece: 'Stück',
			pieceId: 'Drive-Ordner-ID',
			part: 'Stimme',
			fileId: 'Datei-ID',
			kind: 'Art',
			comment: 'Kommentar',
			status: 'Status',
			note: 'Notiz',
			reportedBy: 'Gemeldet von',
			reportedAt: 'Gemeldet am',
			marked: 'Im Dateinamen',
			driveComment: 'Drive-Kommentar-ID',
			/** A better Hörbeispiel, with "Hörbeispiel falsch". */
			link: 'Vorschlag',
			/** Scan-Auftrag: wie dringend, wer scannt (E-Mail), was zu tun ist. */
			priority: 'Priorität',
			assignee: 'Wer scannt',
			task: 'Scan-Auftrag',
			id: 'Meldungs-ID'
		}
	},
	wishes: {
		tab: 'Wünsche',
		columns: {
			kind: 'Art',
			title: 'Titel',
			composer: 'Komponist',
			link: 'Link',
			description: 'Beschreibung',
			status: 'Status',
			answer: 'Antwort',
			submittedBy: 'Eingereicht von',
			submittedAt: 'Datum',
			votes: '+1',
			concert: 'Konzert',
			pieceId: 'Stück-ID',
			id: 'Wunsch-ID'
		}
	},
	/** Generated from the archive's file names; the app rewrites it, people only tick "erledigt". */
	missingParts: {
		tab: 'Fehlende Stimmen',
		columns: {
			piece: 'Stück',
			part: 'Stimme',
			status: 'Status',
			fileId: 'Datei-ID',
			done: 'erledigt',
			/** Scan-Aufträge: welche Lücke zuerst, und wer sie scannt (E-Mail). */
			priority: 'Priorität',
			assignee: 'Wer scannt'
		}
	},
	/** Who plays from which part: "B-Stimmen" are read by clarinets and trumpets. */
	instrumentGroups: {
		tab: 'Instrumentgruppen',
		columns: {
			part: 'Stimme',
			players: 'Gespielt von',
			mutual: 'Gegenseitig',
			note: 'Notiz'
		}
	},
	signups: {
		tab: 'Anmeldungen',
		columns: {
			event: 'Termin',
			who: 'Wer',
			name: 'Name',
			answer: 'Antwort',
			instrument: 'Instrument',
			comment: 'Kommentar',
			answeredAt: 'Datum',
			eventId: 'Termin-ID'
		}
	},
	/** Which pieces are rehearsed at which rehearsal (#65); one row per rehearsal and piece. */
	rehearsals: {
		tab: 'Proben',
		columns: {
			rehearsal: 'Probe',
			piece: 'Stück',
			notes: 'Notiz',
			eventId: 'Termin-ID'
		}
	},
	/** Rented or borrowed sheet music (#119); one row per loan. */
	loans: {
		tab: 'Leihmaterial',
		columns: {
			piece: 'Stück',
			from: 'Von',
			borrowedAt: 'Ausgeliehen am',
			dueAt: 'Zurück bis',
			returned: 'Zurückgegeben',
			notes: 'Notiz'
		}
	},
	/** Who came to a rehearsal (#120); one row per rehearsal and person. */
	attendance: {
		tab: 'Anwesenheit',
		columns: {
			event: 'Termin',
			who: 'Wer',
			name: 'Name',
			present: 'Anwesend',
			eventId: 'Termin-ID'
		}
	},
	/** Notes on a piece from rehearsals (#125): cuts, repeats, bowings; one row per note. */
	pieceNotes: {
		tab: 'Hinweise',
		columns: {
			piece: 'Stück',
			/** Empty for everyone, else a section ("Streicher") or an instrument ("Geige"). */
			section: 'Für',
			/** Empty for every performance, else a concert's "Anlass". */
			concert: 'Konzert',
			note: 'Hinweis',
			by: 'Von',
			at: 'Datum',
			id: 'Hinweis-ID'
		}
	},
	/** Who plays which part instead of their own (#262): "die Saxophone spielen Fagott". */
	partAssignments: {
		tab: 'Stimmenzuteilung',
		columns: {
			/** A member's e-mail, or an instrument for all its players ("Saxophon"). */
			who: 'Wer',
			/** The part they play instead, as in file names: "Fagott II". */
			part: 'Spielt',
			/** Empty for every piece. */
			piece: 'Stück',
			/** Empty for always, else a concert's "Anlass". */
			concert: 'Konzert',
			by: 'Von',
			at: 'Datum',
			id: 'Zuteilungs-ID'
		}
	},
	/** What a rehearsal did and what comes next (#145); one row per rehearsal. */
	rehearsalNotes: {
		tab: 'Probennotizen',
		columns: {
			rehearsal: 'Probe',
			done: 'Geprobt',
			practise: 'Zum Üben',
			next: 'Nächstes Mal',
			by: 'Von',
			at: 'Datum',
			eventId: 'Termin-ID'
		}
	},
	/** A deployment's own instrument labels and spellings (#143); one row per instrument that differs from the preset. */
	instruments: {
		tab: 'Instrumente',
		columns: {
			name: 'Instrument',
			label: 'Anzeige',
			aliases: 'Weitere Schreibweisen'
		}
	},
	/** Name, look and features set on /einstellungen; one row per setting. */
	settings: {
		tab: 'Einstellungen',
		columns: {
			key: 'Einstellung',
			value: 'Wert'
		},
		/** The words in the "Einstellung" column, one row each. */
		keys: {
			name: 'Name',
			shortName: 'Kurzname',
			logo: 'Logo',
			accent: 'Akzentfarbe',
			look: 'Stil',
			featuresOff: 'Ausgeschaltet',
			retention: 'Aufbewahrung (Saisons)',
			links: 'Links'
		},
		/** The words for the look in the "Wert" column (#163). */
		lookValues: {
			bold: 'kräftig',
			plain: 'schlicht'
		}
	}
} as const;
