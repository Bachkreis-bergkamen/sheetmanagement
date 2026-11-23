/** Missing parts on IMSLP (#198), on "Fehlende Stimmen". */
export const imslp = {
	search: 'Auf IMSLP suchen',
	searching: 'Suche auf IMSLP …',
	searchHint: 'Für gemeinfreie Werke: findet die Seite des Werks auf IMSLP und welche Stimmen es dort gibt. Herunterladen und hochladen bleibt Handarbeit, die Lizenzen sind je Ausgabe verschieden.',
	open: 'Seite auf IMSLP öffnen',
	has: (parts: string) => `Stimmen dort: ${parts}`,
	noParts: 'Auf der Seite gibt es keine einzelnen Stimmen, vielleicht nur Partituren.',
	complete: 'Dazu alle Stimmen in einer Datei („Complete Parts“).',
	found: (label: string) => `${label}: auf IMSLP`,
	notFound: (label: string) => `${label}: nicht dabei`,
	none: 'Auf IMSLP ist kein Werk gefunden worden, das sicher dieses ist.',
	unavailable: 'IMSLP ist gerade nicht erreichbar.',
	searchThere: 'Selbst auf IMSLP suchen',
	notSearchable: 'Für dieses Stück lohnt die Suche auf IMSLP nicht.'
} as const;
