/** A full set of parts to print for a concert (#195). */
export const partSet = {
	link: 'Stimmensatz',
	title: 'Stimmensatz',
	lead: (players: number) =>
		`Wie viele Ausdrucke jede Stimme braucht, aus ${players === 1 ? '1 aktiven Mitglied' : `${players} aktiven Mitgliedern`} und ihren Instrumenten: eine pro Person, bei Streichern eine pro Pult, die Partitur einmal. Zum Prüfen und Ändern, dann als eine PDF zum Drucken.`,
	players: (n: number) => (n === 1 ? '1 spielt' : n ? `${n} spielen` : 'niemand'),
	copies: (part: string) => `Ausdrucke von ${part}`,
	noMusic: 'Keine Noten im Archiv.',
	total: (copies: number, parts: number) => `${copies} ${copies === 1 ? 'Ausdruck' : 'Ausdrucke'} von ${parts} ${parts === 1 ? 'Stimme' : 'Stimmen'}`,
	build: 'Als eine PDF',
	building: (i: number, n: number) => `Stimme ${i} von ${n} …`,
	notPdf: 'keine PDF',
	fileName: 'Stimmensatz',
	orchestra: 'Für',
	allOrchestras: 'Alle Orchester',
	apply: 'Anzeigen'
} as const;
