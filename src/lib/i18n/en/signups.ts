import type { Texts } from '../types.ts';

export const signups: Texts['signups'] = {
	title: 'Sign-up',
	question: 'Are you coming?',
	answers: { yes: "I'm coming", maybe: 'Maybe', no: "I can't" } as Record<string, string>,
	answerValues: { yes: 'Yes', maybe: 'Maybe', no: 'No' } as Record<string, string>,
	yourAnswer: 'Your answer',
	/** On the start page, after the short line "You're coming" (#214): shows the buttons again. */
	change: 'change',
	status: { yes: "You're coming", maybe: 'Maybe', no: "Can't come", open: 'Not answered' } as Record<string, string>,
	instrument: 'Instrument for this date',
	ownInstrument: (instrument: string) => (instrument ? `as on your profile (${instrument})` : 'as on your profile'),
	comment: 'Comment (optional)',
	commentHint: "e.g. I'll be late",
	details: 'Change instrument or comment',
	save: 'Save',
	saved: 'Saved.',
	withdraw: 'Withdraw answer',
	signInNeeded: 'Please sign in to say yes or no.',
	notSetUp: 'Sign-ups: not in the sheet yet. Please run “Set up sheet” once.',
	failed: "Your answer couldn't be saved just now. Please try again.",
	queued: "Kept on this device. It's sent as soon as you're back online.",
	gone: "This date doesn't exist (any more) or is over.",
	coverage: 'Instrumentation',
	coverageLead: 'Yeses per part.',
	byPart: 'Split by part',
	summary: (yes: number, maybe: number, no: number, open: number) =>
		[`${yes} yes`, maybe && `${maybe} maybe`, no && `${no} no`, open && `${open} open`].filter(Boolean).join(' · '),
	uncovered: 'nobody',
	noInstrument: 'No instrument',
	kinds: { yes: 'coming', maybe: 'maybe', no: "can't come", open: 'open' } as Record<string, string>,
	comments: 'Comments',
	noOne: 'No answers yet and no members with an instrument.'
};
