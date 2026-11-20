export const duration = {
	label: 'Dauer',
	/** "ca. 74 Min. (2 Stücke ohne Dauer)" */
	total: (minutes: number, missing: number) =>
		`ca. ${minutes} Min.${missing ? ` (${missing === 1 ? '1 Stück' : `${missing} Stücke`} ohne Dauer)` : ''}`,
	/** One piece's length next to dates and times, where "17:30" would read as a clock time (#218). */
	minutes: (minutes: number) => `${minutes} Min.`,
	unknown: 'Dauer noch unbekannt',
	hint: 'Die Dauer steht beim Stück („Angaben bearbeiten“) und wird hier zusammengezählt.'
} as const;
