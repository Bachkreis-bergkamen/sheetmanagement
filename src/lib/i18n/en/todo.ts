import type { Texts } from '../types.ts';

/** Everything waiting for you, in one list (#185). */
export const todo: Texts['todo'] = {
	title: 'To do',
	lead: 'Everything waiting for you right now, in one place. Each row leads to where you deal with it.',
	empty: 'Nothing open. Nice!',
	/** Before a deadline: polls and rented music. */
	until: (date: string) => `by ${date}`,
	kinds: {
		report: 'Reports',
		request: 'Access requests',
		wish: 'Wishes',
		loan: 'Rented music to return',
		instrument: 'Take instruments back',
		duty: 'Fill duties',
		attendance: 'Take attendance',
		poll: 'Date polls to answer',
		other: 'Also'
	} as Record<string, string>,
	/** On the organisers' hub, above the groups. */
	hub: (n: number) => (n === 1 ? '1 thing waiting' : `${n} things waiting`)
};
