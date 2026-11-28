/** A piece's background, "Wissenswertes" (#411): for the Moderation and the Programmheft. */
export const facts = {
	title: 'Wissenswertes',
	sources: 'Quellen',
	/** Written before a source line, and read back from it ("Quelle: …"). */
	sourcePrefix: 'Quelle',
	hint: 'Woher das Stück kommt, wie wir es bekommen haben, Geschichten dazu – für die Moderation und das Programmheft. Leerzeile für einen neuen Absatz, „Quelle: …“ in eine eigene Zeile.',
	placeholder: 'z. B. Beethoven schrieb die Musik 1810 für Goethes Trauerspiel …',
	/** Speaking time on stage, at about 130 words a minute. */
	speaking: (seconds: number) => (seconds < 45 ? 'unter 1 Min. zum Vorlesen' : `ca. ${Math.round(seconds / 60)} Min. zum Vorlesen`),
	empty: 'Noch nichts eingetragen.',
	add: 'Wissenswertes ergänzen',
	edit: 'Bearbeiten',
	lookup: 'Auf Wikipedia suchen',
	lookupHint: 'Sucht nach Titel und Komponist. Der Text gehört Wikipedia (CC BY-SA): Übernommenes bekommt eine Quellenzeile.',
	webSearch: 'Im Web suchen',
	searching: 'Suche …',
	loading: 'Lade Artikel …',
	query: 'Suchbegriff',
	search: 'Suchen',
	nothing: 'Wikipedia kennt dazu keinen Artikel. Ein anderer Suchbegriff, etwa der Originaltitel, hilft vielleicht.',
	noIntro: 'Der Artikel hat keine Einleitung, die sich übernehmen lässt.',
	busy: 'Wikipedia bittet um eine kurze Pause. Gleich noch einmal versuchen.',
	failed: 'Wikipedia ließ sich nicht erreichen.',
	inLanguage: (language: string) => (language === 'en' ? 'englisch' : 'deutsch'),
	take: 'Übernehmen',
	takeHint: 'Hängt die Einleitung mit Quellenzeile an das Feld an. Kürzen und in eigene Worte fassen lohnt sich.',
	close: 'Schließen',
	back: 'Andere Treffer',
	source: (title: string, url: string) => `Quelle: Wikipedia, „${title}“ (CC BY-SA 4.0) ${url}`,
	sourceName: 'Wikipedia'
} as const;
