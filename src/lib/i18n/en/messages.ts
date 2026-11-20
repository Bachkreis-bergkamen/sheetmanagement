import type { Texts } from '../types.ts';

/** Short answers from the server: refusals, things that are gone or unreachable, setup problems. */
export const messages: Texts['messages'] = {
	signInFirst: 'Please sign in first.',
	noRight: "You don't have the right to do that.",
	membersOnly: 'Only for signed-in members.',
	badRequest: 'Invalid request.',
	archiveUnavailable: "The library can't be reached just now.",
	calendarUnavailable: "The calendar can't be reached just now.",
	sheetFailed: "The sheet couldn't be changed just now. Please try again.",
	noFile: "This file isn't in the library.",
	driveFailed: (status: string) => `The file couldn't be loaded from Drive (Drive: ${status}).`,
	noAnswer: 'no answer',
	noPicture: 'No image.',
	wikimediaUnavailable: "Wikimedia can't be reached just now.",
	noVideoLength: 'Without YOUTUBE_API_KEY there is no video length.',
	youtubeUnavailable: "YouTube can't be reached just now.",
	signInOff: "Sign-in isn't set up.",
	noCalendar: "This calendar doesn't exist.",
	noEvent: "This date isn't (or is no longer) in the calendar.",
	noConcert: "This concert doesn't exist.",
	noPiece: "This piece isn't (or is no longer) in the library.",
	featureOff: 'Not turned on.',
	programUnreadable: "The programme couldn't be read.",
	grantMissing: 'Please give “Who” and a right.',
	notSet: (variable: string) => `${variable} is not set.`,
	noAdmins: 'BOOTSTRAP_ADMINS is not set: nobody can approve members.',
	runSetup: (page: string) => `Please run “${page}”.`,
	shortSecret: (min: number) => `SESSION_SECRET is missing or shorter than ${min} characters.`,
	missingTab: (tab: string) => `The “${tab}” tab is missing.`,
	missingColumns: (tab: string, columns: string) => `The “${tab}” tab is missing columns: ${columns}.`
};
