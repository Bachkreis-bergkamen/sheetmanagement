/**
 * Links to an album and the recordings player (#66, #408), apart from the album's own texts:
 * the pages of a date, a trip and a piece read only these, and stay within their JS budget.
 */
export const albumLink = {
	title: 'Photos & impressions',
	summary: (photos: number, videos: number, comments: number) =>
		[
			photos ? (photos === 1 ? '1 photo' : `${photos} photos`) : '',
			videos ? (videos === 1 ? '1 recording' : `${videos} recordings`) : '',
			comments ? (comments === 1 ? '1 comment' : `${comments} comments`) : ''
		]
			.filter(Boolean)
			.join(' · ') || 'Add photos and tell how it was',
	play: 'Play',
	playHint: 'The video comes from YouTube, without cookies until you play it.',
	open: 'Open on YouTube',
	at: (clock: string) => `from ${clock}`,
	/** On a piece's page. */
	ours: 'Our recordings',
	oursLead: 'From our concerts, for members only.'
} as const;
