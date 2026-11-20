export const signups = {
	title: 'Anmeldung',
	question: 'Bist du dabei?',
	answers: { yes: 'Ich komme', maybe: 'Vielleicht', no: 'Ich kann nicht' } as Record<string, string>,
	answerValues: { yes: 'Zusage', maybe: 'Vielleicht', no: 'Absage' } as Record<string, string>,
	yourAnswer: 'Deine Antwort',
	/** On the start page, after the short line "Du kommst" (#214): shows the buttons again. */
	change: 'ändern',
	/** In the calendar list: what you answered, or that the date still waits for it. */
	status: { yes: 'Du kommst', maybe: 'Vielleicht', no: 'Abgesagt', open: 'Antwort fehlt' } as Record<string, string>,
	instrument: 'Instrument bei diesem Termin',
	ownInstrument: (instrument: string) => (instrument ? `wie im Profil (${instrument})` : 'wie im Profil'),
	comment: 'Kommentar (optional)',
	commentHint: 'z. B. komme später',
	details: 'Instrument oder Kommentar ändern',
	save: 'Speichern',
	saved: 'Gespeichert.',
	withdraw: 'Antwort zurückziehen',
	signInNeeded: 'Für Zu- und Absagen bitte anmelden.',
	notSetUp: 'Anmeldungen: Fehlt noch in der Tabelle. Bitte einmal „Tabelle einrichten“ ausführen.',
	failed: 'Die Antwort konnte gerade nicht gespeichert werden. Bitte versuch es noch einmal.',
	queued: 'Auf dem Gerät gemerkt. Wird gesendet, sobald du wieder online bist.',
	gone: 'Diesen Termin gibt es nicht (mehr) oder er ist vorbei.',
	coverage: 'Besetzung',
	coverageLead: 'Zusagen je Stimme.',
	byPart: 'Nach Stimmen getrennt',
	summary: (yes: number, maybe: number, no: number, open: number) =>
		[`${yes} ${yes === 1 ? 'Zusage' : 'Zusagen'}`, maybe && `${maybe} vielleicht`, no && `${no} ${no === 1 ? 'Absage' : 'Absagen'}`, open && `${open} offen`]
			.filter(Boolean)
			.join(' · '),
	uncovered: 'niemand',
	noInstrument: 'Ohne Instrument',
	kinds: { yes: 'kommen', maybe: 'vielleicht', no: 'können nicht', open: 'offen' } as Record<string, string>,
	comments: 'Kommentare',
	noOne: 'Noch keine Antworten und keine Mitglieder mit Instrument.'
} as const;
