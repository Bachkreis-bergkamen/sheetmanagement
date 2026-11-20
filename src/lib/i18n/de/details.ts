export const details = {
	title: 'Angaben ergänzen',
	lead: 'Stücke mit fehlenden Angaben, der Reihe nach ergänzen. Vorschläge helfen.',
	filterLabel: 'Was fehlt',
	filters: {
		alle: 'Etwas fehlt',
		komponist: 'Ohne Komponist',
		genre: 'Ohne Genre',
		hoerbeispiel: 'Ohne Hörbeispiel',
		werkverzeichnis: 'Ohne Werkverzeichnis'
	} as Record<string, string>,
	missing: { composer: 'Komponist', genre: 'Genre', recording: 'Hörbeispiel', catalogue: 'Werkverzeichnis' } as Record<string, string>,
	progress: (percent: number) => `${percent} % der Stücke vollständig`,
	start: (n: number) => (n === 1 ? 'Das eine Stück bearbeiten' : `Der Reihe nach bearbeiten (${n})`),
	working: (filter: string, open: number) => `Angaben ergänzen · ${filter}: noch ${open} ${open === 1 ? 'Stück' : 'Stücke'}.`,
	saveNext: 'Speichern & weiter',
	backToList: 'Zur Liste',
	allDone: 'Geschafft: In dieser Liste ist nichts mehr offen.',
	none: 'Hier fehlt nichts.',
	noRecording: 'Gibt es keins',
	noRecordingHint: (title: string) => `„${title}“ hat kein Hörbeispiel: nicht mehr danach fragen`,
	noRecordingSaved: (title: string) => `„${title}“: als ohne Hörbeispiel vermerkt.`
} as const;
