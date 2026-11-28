/** A piece's background, "Wissenswertes" (#411): what the piece page and the print page show. */
export const facts = {
	title: 'Wissenswertes',
	sources: 'Quellen',
	/** Speaking time on stage, at about 130 words a minute. */
	speaking: (seconds: number) => (seconds < 45 ? 'unter 1 Min. zum Vorlesen' : `ca. ${Math.round(seconds / 60)} Min. zum Vorlesen`),
	add: 'Wissenswertes ergänzen'
} as const;
