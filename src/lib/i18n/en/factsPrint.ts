import type { Texts } from '../types.ts';

/** The Programmheft and the moderation sheet on the print page (#411); only that page loads these. */
export const factsPrint: Texts['factsPrint'] = {
	booklet: 'Programme booklet',
	bookletHint: 'For the audience: the programme with background on each piece.',
	moderation: 'Presenter',
	moderationHint: 'For whoever presents: order, start time, length and what there is to tell about each piece.',
	factsGaps: (n: number) => (n === 1 ? '1 piece has no background yet.' : `${n} pieces have no background yet.`),
	factsComplete: 'Every piece has background.',
	fill: 'Add',
	startsAt: (minutes: number) => `from min. ${minutes}`,
	speakingTotal: (minutes: number) => `Presenting about ${minutes} min`,
	nothingToTell: 'Nothing entered yet.',
	ownNotes: 'Own notes'
};
