/** Photos and videos of members (#299): the answer on /eltern and /profil, the overview for the Leitung. */
export const photos = {
	title: 'Fotos und Videos',
	leadChild: (name: string) =>
		`Darf ${name} auf Fotos und Videos des Orchesters erscheinen, etwa auf der Website, im Programmheft oder in sozialen Medien? Ohne Antwort gilt Nein.`,
	leadSelf: 'Darfst du auf Fotos und Videos des Orchesters erscheinen, etwa auf der Website, im Programmheft oder in sozialen Medien? Ohne Antwort gilt Nein.',
	state: { yes: 'Erlaubt.', no: 'Nicht erlaubt.', open: 'Noch nicht beantwortet, das gilt als Nein.' } as Record<string, string>,
	allow: 'Erlauben',
	refuse: 'Nicht erlauben',
	saved: 'Gespeichert.',
	failed: 'Das hat nicht geklappt. Bitte lade die Seite neu und versuch es noch einmal.',
	/** On /profil of a young player: their parents decide. */
	byParents: 'Das beantworten deine Eltern im Elternbereich.',
	/** In "Meine Daten herunterladen". */
	export: 'Fotos und Videos',
	/** On a date's page, for those who see the sign-ups. */
	date: {
		over: 'Fotos und Videos',
		allAllowed: 'Alle dürfen auf Fotos und Videos erscheinen.',
		notAllowed: (n: number) => (n === 1 ? '1 Person nicht zeigen' : `${n} Personen nicht zeigen`),
	},
	/** The overview on /fotoerlaubnis. */
	overview: {
		title: 'Fotoerlaubnis',
		lead: 'Wer auf Fotos und Videos des Orchesters erscheinen darf. Junge Mitglieder mit Eltern-Konto beantworten das über ihre Eltern, alle anderen selbst im Profil.',
		answers: { no: 'Nicht erlaubt', open: 'Noch offen', yes: 'Erlaubt' } as Record<string, string>,
		byParent: 'von den Eltern',
		count: (n: number) => (n === 1 ? '1 Person' : `${n} Personen`),
		empty: 'Niemand.',
		copy: 'Namen kopieren',
		copied: 'Kopiert.'
	}
} as const;
