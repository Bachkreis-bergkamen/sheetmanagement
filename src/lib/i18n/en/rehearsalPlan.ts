import type { Texts } from '../types.ts';

export const rehearsalPlan: Texts['rehearsalPlan'] = {
	title: 'Rehearsed',
	planned: 'Rehearsed:',
	empty: 'Not entered yet.',
	edit: 'Edit rehearsal plan',
	pageTitle: (concert: string) => `Rehearsal plan: ${concert}`,
	lead: 'For each rehearsal, tap the pieces it covers.',
	all: 'All',
	none: 'None',
	past: 'past',
	count: (n: number) => (n === 1 ? '1 piece' : `${n} pieces`),
	overview: 'How often rehearsed',
	times: (n: number) => (n === 1 ? '1 rehearsal' : `${n} rehearsals`),
	stillToCome: (n: number) => (n === 0 ? 'none left' : `${n} to come`),
	never: 'not planned',
	unplanned: (n: number) =>
		n === 1 ? '1 piece from the programme is not planned for any rehearsal.' : `${n} pieces from the programme are not planned for any rehearsal.`,
	notInProgram: 'not in the programme',
	noProgram: 'Enter the programme first, then the rehearsal plan.',
	noRehearsals: 'No rehearsals in the calendar.',
	notSetUp: 'The repertoire sheet has no “Rehearsals” tab. Please run “Set up sheet” once.',
	notAConcert: 'A rehearsal plan is only for concerts from the calendar.',
	programLink: 'Edit programme',
	save: 'Save',
	cancel: 'Cancel',
	saved: 'Rehearsal plan saved.',
	conflict: 'Someone has changed the rehearsal plan meanwhile. Reload the page and make your change again.',
	failed: "The rehearsal plan couldn't be read."
};
