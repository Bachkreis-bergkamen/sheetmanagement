export const quickSearch = {
	label: 'Schnellsuche',
	open: 'Suchen',
	shortcut: 'Strg K',
	placeholder: 'Stück, Stimme, Konzert oder Seite …',
	inArchive: (n: number) => (n === 1 ? 'Im Archiv zeigen' : `Alle ${n} im Archiv zeigen`),
	pages: 'Seiten',
	pieces: 'Stücke',
	concerts: 'Konzerte',
	upcoming: 'Demnächst',
	recent: 'Zuletzt geöffnet',
	loading: 'Lädt …',
	none: (query: string) => `Nichts gefunden für „${query}“.`,
	keys: '↑↓ wählen · ↵ öffnen · Esc schließen'
} as const;
