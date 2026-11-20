export const dateField = {
	placeholder: 'TT.MM.JJJJ',
	placeholderFuzzy: 'TT.MM.JJJJ, MM.JJJJ oder JJJJ',
	pick: 'Im Kalender wählen',
	unreadable: 'Bitte als Tag.Monat.Jahr, z. B. 21.12.2026.',
	unreadableFuzzy: 'Bitte als 21.12.1957, 12.1957 oder 1957.',
	tooLate: (last: string) => `Geht bis ${last}.`
} as const;
