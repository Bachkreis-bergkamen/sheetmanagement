/** Filters for a list, several at once (archive, calendar). */
export const filters = {
	button: 'Filter',
	active: (label: string, n: number) => `${label}, ${n} aktiv`,
	close: 'Schließen',
	reset: 'Zurücksetzen',
	show: (n: number) => (n === 1 ? '1 Eintrag anzeigen' : `${n} anzeigen`),
	would: (n: number) => (n === 1 ? '1 Eintrag' : `${n} Einträge`)
} as const;
