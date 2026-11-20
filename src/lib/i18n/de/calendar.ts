export const calendar = {
	/** Date polls next to the dates (#95). */
	polls: {
		new: 'Neue Terminumfrage',
		candidate: 'Zur Wahl',
		waiting: (n: number, title: string) => (n === 1 ? `Terminumfrage „${title}“: deine Antwort fehlt` : `${n} Terminumfragen warten auf deine Antwort`)
	},
	edit: {
		open: 'Bearbeiten',
		title: 'Termin bearbeiten',
		save: 'Änderungen speichern',
		lead: 'Wird direkt im Google Kalender geändert, für alle sichtbar.',
		saved: 'Gespeichert: Der Termin ist im Kalender geändert.'
	},
	add: {
		open: 'Termin eintragen',
		short: 'Termin',
		more: 'Weitere Angaben',
		lead: 'Kommt direkt in den Google Kalender, für alle sichtbar.',
		type: 'Art',
		title: 'Titel',
		concertHint: 'z. B. Frühlingskonzert',
		untitled: (word: string) => `leer: „${word}“`,
		date: 'Datum',
		start: 'Beginn',
		end: 'Ende',
		timeHint: 'Ohne Beginn ganztägig; ohne Ende zwei Stunden beim Konzert, drei bei Proben.',
		location: 'Ort',
		locationHint: 'z. B. Aula, Musterschule',
		concert: 'Probe für',
		noConcert: 'Kein bestimmtes Konzert',
		tentative: 'Noch unsicher (erscheint mit „(?)“)',
		description: 'Notiz',
		save: 'In den Kalender eintragen',
		yearOnly: 'Genaues Datum unbekannt, nur das Jahr',
		saveArchive: 'Ins Archiv eintragen',
		leadArchive: 'Liegt in der Vergangenheit: kommt ins Archiv (Repertoire-Tabelle), nicht in den Kalender.',
		archiveOnly: 'Frühere Konzerte kommen ins Archiv; neue Termine trägt ein, wer Termine plant.',
		places: 'Vorschläge für den Ort',
		added: (title: string) => `„${title}“ steht jetzt im Kalender.`,
		show: 'Ansehen',
		/** A role limited to some orchestras (#305) plans only their dates. */
		otherOrchestra: (orchestras: string) => `Du planst Termine nur für ${orchestras}. Bitte eins davon ankreuzen.`,
		readOnly:
			'Termine eintragen ist aus: Die App darf den Kalender nur lesen. Dafür CALENDAR_WRITE="true" setzen und den Kalender für das Dienstkonto mit „Änderungen an Terminen vornehmen“ freigeben.',
		problems: {
			type: 'Bitte Konzert, Probe oder Generalprobe wählen.',
			title: 'Ein Konzert braucht einen Titel.',
			date: 'Bitte ein Datum wählen.',
			'too-early': 'So weit zurück zeigt die Seite keine Termine. Ein früheres Konzert kommt ins Archiv; dafür „Konzert“ wählen.',
			'too-late': 'So weit voraus zeigt die Seite noch keine Termine (bis 18 Monate). Stimmt das Jahr?',
			time: 'Bitte die Uhrzeit als SS:MM angeben; ein Ende nur mit Beginn.',
			end: 'Das Ende muss nach dem Beginn liegen.',
			concert: 'Das Konzert gibt es im Kalender nicht (mehr); bitte eines aus der Liste wählen.',
			orchestra: 'Bitte die Orchester aus der Liste wählen.',
			'too-long': 'Das ist zu lang: Titel bis 120, Ort bis 200, Notiz bis 2000 Zeichen.'
		},
		errors: {
			'not-configured': 'Der Kalender ist noch nicht verbunden (CALENDAR_ID).',
			'read-only':
				'Termine eintragen ist aus: Die App darf den Kalender nur lesen. Dafür CALENDAR_WRITE="true" setzen und den Kalender für das Dienstkonto mit „Änderungen an Terminen vornehmen“ freigeben.',
			refused: 'Google hat abgelehnt: Das Dienstkonto darf in diesem Kalender keine Termine ändern. Bitte den Kalender mit „Änderungen an Terminen vornehmen“ freigeben.',
			failed: 'Der Termin konnte gerade nicht eingetragen werden. Bitte versuch es gleich noch einmal.'
		}
	}
} as const;
