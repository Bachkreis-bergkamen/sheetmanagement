export const instrumentation = {
	title: 'Besetzung',
	lead: 'Welche Stimmen für dieses Programm da sind.',
	onlyPlayed: 'Nur Instrumente der Mitglieder',
	piece: 'Stück',
	legend: {
		own: 'Stimme da',
		shared: 'Gemeinsame Stimme',
		problem: 'Fehlt, leer oder es fehlen Seiten',
		none: 'Keine Stimme'
	},
	noMusic: 'keine Noten',
	gaps: (n: number) => (n === 1 ? '1 Lücke bei Instrumenten der Mitglieder' : `${n} Lücken bei Instrumenten der Mitglieder`)
} as const;
