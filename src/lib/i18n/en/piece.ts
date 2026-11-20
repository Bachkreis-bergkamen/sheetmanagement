import type { Texts } from '../types.ts';

export const piece: Texts['piece'] = {
	details: 'Details',
	/** The member's own parts at the top of the page (#216). */
	yourPart: (part: string) => `Your part: ${part}`,
	alsoPart: (part: string) => `Also: ${part}`,
	yours: 'yours',
	reportedMissing: 'Reported missing',
	reportedMissingHint: 'Reported but not confirmed yet. Once confirmed, there is a placeholder in the folder.',
	folder: 'Drive folder',
	editShort: 'Edit',
	reportShort: 'Report',
	/** Over the one card with all parts. */
	partsTitle: 'Parts',
	/** The side column: upcoming dates, where it was played, related pieces. */
	about: 'About the piece',
	upcoming: 'Coming up',
	recording: 'Recording',
	edit: 'Edit details',
	saved: 'Saved.',
	groups: {
		featured: 'Score & solo',
		holz: 'Woodwind',
		blech: 'Brass',
		schlagwerk: 'Percussion',
		tasten: 'Keyboards & harp',
		gesang: 'Voices',
		streicher: 'Strings',
		sonstige: 'Parts for everyone',
		other: 'Other files'
	},
	partStatus: {
		ok: '',
		missing: 'missing',
		empty: 'empty',
		incomplete: 'pages missing'
	},
	missingSummary: (n: number) =>
		n === 1 ? '1 part is missing, empty or missing pages.' : `${n} parts are missing, empty or missing pages.`,
	playedAt: 'Played at',
	sections: 'Versions',
	playedBadge: 'played',
	sectionHint: {
		played: 'The parts that are played.',
		complete: 'The complete work, for reference.',
		movement: '',
		other: ''
	},
	sectionFolder: 'This folder in Google Drive',
	otherVersions: 'Other versions of this work',
	moreBy: (composer: string) => `More works by ${composer}`,
	/** A medley's songs, from "Contents". */
	contents: 'Contents',
	contentsCount: (n: number) => (n === 1 ? '1 title' : `${n} titles`),
	/** Opens the rest of a shortened composer line. */
	allComposers: (n: number) => `all ${n} composers`,
	/** "More works by …" for a medley: by any of its composers. */
	moreByAny: 'More works by these composers',
	again: 'Play again',
	againMine: "I'd like to play it again",
	againHint: "Tells programme planning you'd like to play this piece again. Click again to take it back.",
	againPlanned: 'Earmarked for a programme.',
	allBy: (composer: string) => `All works by ${composer}`,
	playedAtNone: 'Not entered for any concert yet.',
	playedAtNoSheet: 'Shows once the repertoire sheet is set up.',
	noMusic: 'No music in the library, only entered in the sheet.',
	info: {
		duration: 'Duration',
		publisher: 'Publisher',
		arranger: 'Arrangement',
		genre: 'Genre',
		difficulty: 'Difficulty',
		reviewedAt: 'Checked on',
		notes: 'Note'
	},
	driveHint: 'Opens in Google Drive (needs access to the music folder).',
	portrait: (name: string) => `Portrait of ${name}`,
	portraitCredit: 'Image: Wikimedia Commons',
	filmPicture: (film: string) => `Picture for the film ${film}`,
	musicalPicture: (musical: string) => `Picture for the musical ${musical}`,
	bandPicture: (band: string) => `Logo of ${band}`,
	iconCredit: 'Icon: Iconify'
};
