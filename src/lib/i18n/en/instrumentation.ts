import type { Texts } from '../types.ts';

export const instrumentation: Texts['instrumentation'] = {
	title: 'Instrumentation',
	lead: 'Which parts there are for this programme.',
	onlyPlayed: "Only members' instruments",
	piece: 'Piece',
	legend: {
		own: 'Part there',
		shared: 'Shared part',
		problem: 'Missing, empty or pages missing',
		none: 'No part'
	},
	noMusic: 'no music',
	gaps: (n: number) => (n === 1 ? "1 gap in members' instruments" : `${n} gaps in members' instruments`)
};
