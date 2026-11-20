import type { Texts } from '../types.ts';

export const archive: Texts['archive'] = {
	addPiece: 'Enter a piece without music',
	addPieceLead: 'For pieces played without music in the library.',
	addWithMusic: 'Add a piece with music',
	addWithMusicLead: 'Enters the piece and creates its folder in the music archive, named by the convention. Then upload the PDFs straight away.',
	addWithMusicSave: 'Create and upload music',
	orchestra: 'Orchestra',
	pieceTitle: 'Title',
	composer: 'Composer',
	catalogue: 'Catalogue no.',
	add: 'Enter',
	failed: "The sheet couldn't be changed just now. Please try again.",
	problems: {
		'title-missing': 'Please give a name.',
		'title-taken': 'This title exists already. Programmes find pieces by title, so it must be unique.',
		'day-taken': 'There already is a concert of this name on this day. The same name on another day is fine.',
		'bad-date': "The date can't be read. Possible are 21.12.1957, 12.1957 or 1957."
	},
	editConcert: 'Edit archive entry',
	editConcertLead: 'Name, day, place and orchestra. Programme, notes and wishes stay with this concert.',
	concertTitle: 'Occasion',
	date: 'Date',
	dateHint: 'DD.MM.YYYY, only the month (12.1957) or the year (1957)',
	location: 'Place',
	save: 'Save',
	saved: 'Saved.'
};
