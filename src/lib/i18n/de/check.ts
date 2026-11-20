/** The planners' checklist on a concert page, worked out from the data. */
export const check = {
	title: 'Konzert-Check',
	lead: 'Was für dieses Konzert schon steht und was noch fehlt.',
	allDone: 'Alles erledigt',
	pieces: (n: number) => (n === 1 ? '1 Stück' : `${n} Stücken`),
	open: (n: number) => (n === 1 ? '1 Punkt offen' : `${n} Punkte offen`),
	program: (n: number) => (n === 1 ? 'Programm mit 1 Stück eingetragen' : `Programm mit ${n} Stücken eingetragen`),
	noProgram: 'Noch kein Programm eingetragen',
	partsComplete: 'Alle Stimmen im Archiv',
	partGaps: (pieces: string) => `Bei ${pieces} fehlen Stimmen oder Seiten`,
	planComplete: 'Jedes Stück ist in einer Probe eingeplant',
	duration: (minutes: number) => `Dauer ca. ${minutes} Min.`,
	durationGaps: (pieces: string) => `Bei ${pieces} fehlt die Dauer`,
	loansDue: (titles: string) => `Leihmaterial muss vor dem Konzert zurück: ${titles}`,
	returnLoans: (titles: string) => `Leihmaterial zurückgeben: ${titles}`,
	reportReady: 'Musikfolge für die GEMA ist vollständig',
	reportGaps: (pieces: string) => `Musikfolge: Bei ${pieces} fehlen noch Angaben`
} as const;
