/**
 * Links to an album and the recordings player (#66, #408), apart from the album's own texts:
 * the pages of a date, a trip and a piece read only these, and stay within their JS budget.
 */
export const albumLink = {
	title: 'Fotos & Eindrücke',
	summary: (photos: number, videos: number, comments: number) =>
		[
			photos ? (photos === 1 ? '1 Foto' : `${photos} Fotos`) : '',
			videos ? (videos === 1 ? '1 Aufnahme' : `${videos} Aufnahmen`) : '',
			comments ? (comments === 1 ? '1 Kommentar' : `${comments} Kommentare`) : ''
		]
			.filter(Boolean)
			.join(' · ') || 'Fotos hinzufügen und erzählen, wie es war',
	play: 'Abspielen',
	playHint: 'Das Video kommt von YouTube, ohne Cookies, bis du abspielst.',
	open: 'Auf YouTube öffnen',
	at: (clock: string) => `ab ${clock}`,
	/** On a piece's page. */
	ours: 'Unsere Aufnahmen',
	oursLead: 'Aus unseren Konzerten, nur für Mitglieder.'
} as const;
