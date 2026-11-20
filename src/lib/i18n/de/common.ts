export const common = {
	comingSoon: 'Bald verfügbar',
	backHome: 'Zur Übersicht',
	loading: 'Seite lädt',
	saveFailed: 'Speichern hat nicht geklappt. Deine Eingaben sind noch da – bitte versuch es noch einmal.',
	saveUnavailable: 'Google antwortet nicht, nichts gespeichert. Deine Eingaben sind noch da.',
	/** The same save was sent twice and the first one is still running (#191). */
	stillSaving: 'Das wird gerade noch gespeichert. Warte kurz und tipp dann noch einmal.',
	/** A row the save was going to change was changed or deleted in the meantime (#156). */
	sheetChanged: 'Jemand hat das inzwischen in der Tabelle geändert. Lade die Seite neu und mach deine Änderung noch einmal.',
	/** Other saves took too long; nothing was saved. */
	sheetBusy: 'Gerade speichern viele gleichzeitig. Bitte gleich noch einmal versuchen.',
	unsaved: 'Deine Änderungen sind noch nicht gespeichert. Seite trotzdem verlassen?',
	share: 'Teilen',
	copied: 'Kopiert. Jetzt z. B. in WhatsApp einfügen.',
	copyFailed: 'Kopieren hat nicht geklappt.',
	quote: (text: string) => `„${text}“`
} as const;
