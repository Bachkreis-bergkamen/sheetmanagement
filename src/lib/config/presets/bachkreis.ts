import type { OrchestraConfig } from '../types.ts';

/**
 * Example preset: a German amateur symphony orchestra whose Drive follows a naming
 * convention ("<Titel> - <Stimme>[ - FEHLT].pdf", "@" for scores) but still holds many
 * older files with English or abbreviated names ("Best_of_Bach-ViolinII.pdf").
 */
export const bachkreis: OrchestraConfig = {
	name: 'Bachkreis Ehemaligenorchester',
	shortName: 'Bachkreis',
	accent: '#e6b422',
	// A deeper, warmer gold than the derived shade, like the posters.
	accentLight: 'color-mix(in oklab, #e6b422 44%, #3a1f00)',
	timeZone: 'Europe/Berlin',
	locale: 'de-DE',

	instruments: [
		{ name: 'Partitur', family: 'partitur', common: true, aliases: ['Score', 'Full Score', 'Direktion', 'Dirigent', 'Conductor', 'Gesamtausgabe', 'Gesammtausgabe', 'Ges', 'Full Orchestra'] },
		// Reductions of the score: for rehearsals at the piano, or a strings-only setting.
		{ name: 'Klavierauszug', family: 'partitur', common: true, aliases: ['Klavier-Auszug', 'Klavierauszüge', 'Piano Reduction', 'Piano Score', 'Piano Conductor', 'Vocal Score'] },
		{ name: 'Streicherauszug', family: 'partitur', common: true, aliases: ['Streicher-Auszug', 'String Reduction', 'Strings Reduction', 'String Score'] },

		{ name: 'Blockflöte', family: 'holz', aliases: ['Recorder', 'Recorders'] },
		{ name: 'Tenor-Blockflöte', family: 'holz', aliases: ['Tenorblockflöte', 'Tenor Recorder'] },
		{ name: 'Piccolo', family: 'holz', aliases: ['Piccoloflöte', 'Picc'] },
		{ name: 'Flöte', family: 'holz', common: true, aliases: ['Flöten', 'Querflöte', 'Floete', 'Flute', 'Flutes'] },
		{ name: 'Oboe', family: 'holz', common: true, aliases: ['Oboen', 'Oboes'] },
		{ name: 'Englischhorn', family: 'holz', aliases: ['English Horn', 'Cor Anglais'] },
		{ name: 'Klarinette', family: 'holz', common: true, aliases: ['Klarinetten', 'Clarinet', 'Clarinets', 'Clarinette', 'Clarinettes', 'Clarinett', 'Calarinet', 'Clari'] },
		{ name: 'Bassklarinette', family: 'holz', aliases: ['Bass Clarinet', 'Bass Clari', 'Bass Klarinette'] },
		{ name: 'Fagott', family: 'holz', common: true, aliases: ['Fagotte', 'Bassoon', 'Bassoons', 'Bassoonpdf', 'Basson', 'Bassons'] },
		{ name: 'Sopran-Saxophon', family: 'holz', aliases: ['Sopransaxophon', 'Soprano Sax'] },
		{ name: 'Alt-Saxophon', family: 'holz', aliases: ['Altsaxophon', 'Alt Sax', 'Alto Sax', 'Alto Saxophone', 'Altsax', 'Alt Saxphone'] },
		{ name: 'Tenor-Saxophon', family: 'holz', aliases: ['Tenorsaxophon', 'Tenor Sax', 'Tenor Saxophone', 'Tenorsax'] },
		{ name: 'Bariton-Saxophon', family: 'holz', aliases: ['Baritonsaxophon', 'Bari Sax', 'Baritone Sax'] },
		{ name: 'Saxophon', family: 'holz', aliases: ['Sax', 'Saxophone', 'Saxphone'] },
		{ name: 'Holz', family: 'holz', aliases: ['Holzbläser', 'Woodwinds'] },

		{ name: 'Horn', family: 'blech', common: true, aliases: ['Hörner', 'Waldhorn', 'French Horn', 'Horns'] },
		{ name: 'Trompete', family: 'blech', common: true, aliases: ['Trompeten', 'Trumpet', 'Trumpets'] },
		{ name: 'Posaune', family: 'blech', common: true, aliases: ['Posaunen', 'Trombone', 'Trombones', 'Tombone', 'Pos'] },
		{ name: 'Bassposaune', family: 'blech', aliases: ['Bass Trombone', 'Bass Posaune'] },
		{ name: 'Bariton', family: 'blech', aliases: ['Baritone', 'Euphonium'] },
		{ name: 'Tuba', family: 'blech', common: true, aliases: ['Basstuba', 'Bass Tuba'] },
		{ name: 'Blech', family: 'blech', aliases: ['Blechbläser', 'Brass'] },

		{ name: 'Pauke', family: 'schlagwerk', common: true, aliases: ['Pauken', 'Timpani', 'Timp'] },
		{ name: 'Schlagwerk', family: 'schlagwerk', common: true, aliases: ['Schlagzeug', 'Drum Set', 'Drumset', 'Drums'] },
		{ name: 'Percussion', family: 'schlagwerk', aliases: ['Perc'] },
		{ name: 'Mallet Percussion', family: 'schlagwerk', aliases: ['Mallets'] },
		{ name: 'Glockenspiel', family: 'schlagwerk', aliases: ['Bells'] },
		{ name: 'Xylophon', family: 'schlagwerk', aliases: ['Xylophone'] },
		{ name: 'Becken', family: 'schlagwerk', aliases: ['Cymbals'] },
		{ name: 'Große Trommel', family: 'schlagwerk', aliases: ['Gran Cassa', 'Bass Drum'] },
		{ name: 'Trommel', family: 'schlagwerk', aliases: ['Kleine Trommel', 'Snare Drum', 'Snare'] },
		{ name: 'Tamburin', family: 'schlagwerk', aliases: ['Tambourine'] },
		{ name: 'Tamtam', family: 'schlagwerk', aliases: ['Tam Tam', 'Gong'] },

		{ name: 'Cembalo', family: 'tasten', aliases: ['Harpsichord'] },
		{ name: 'Klavier', family: 'tasten', aliases: ['Piano'] },
		{ name: 'Orgel', family: 'tasten', aliases: ['Organ'] },
		{ name: 'Synthesizer', family: 'tasten', aliases: ['Synth', 'Keyboard', 'Roland'] },
		{ name: 'Harfe', family: 'tasten', aliases: ['Harp'] },
		{ name: 'Continuo', family: 'tasten', aliases: ['Basso Continuo'] },

		{ name: 'Sopran', family: 'gesang', aliases: ['Soprano'] },
		{ name: 'Chor', family: 'gesang', aliases: ['SATB', 'Choir'] },
		{ name: 'Gesang', family: 'gesang', aliases: ['Vocals', 'Vocal'] },

		{ name: 'C-Stimmen', family: 'sonstige' },
		{ name: 'B-Stimmen', family: 'sonstige' },
		{ name: 'Es-Stimmen', family: 'sonstige' },
		{ name: 'F-Stimmen', family: 'sonstige' },
		{ name: 'Stimme', family: 'sonstige', aliases: ['Part'], voice: true },

		// The app says Geige · Bratsche · Cello · Kontrabass; the files keep their words (Viola, Violoncello).
		{ name: 'Geige', family: 'streicher', common: true, aliases: ['Geigen', 'Violine', 'Violinen', 'Violin', 'Violins'] },
		{ name: 'Viola', label: 'Bratsche', family: 'streicher', common: true, aliases: ['Violen', 'Bratsche', 'Bratschen', 'Violas', 'Vioa'] },
		{ name: 'Violoncello', label: 'Cello', family: 'streicher', common: true, aliases: ['Cello', 'Celli', 'Cellos', 'Violoncellos'] },
		{
			name: 'Kontrabass',
			family: 'streicher',
			common: true,
			aliases: ['Kontrabässe', 'Contrabass', 'Contrabasses', 'Double Bass', 'String Bass', 'Stringbass', 'Bass']
		},
		{ name: 'E-Bass', family: 'streicher', aliases: ['Bass Guitar', 'Electric Bass', 'E Bass'] }
	],

	naming: {
		separator: ' - ',
		featuredPrefix: '@',
		status: {
			missing: 'FEHLT',
			empty: 'LEER',
			incomplete: 'UNVOLLSTÄNDIG'
		},
		statusAliases: { incomplete: 'incomplete', incomp: 'incomplete', unvollstaendig: 'incomplete' },
		cataloguePatterns: [
			/\bBWV\s*\d+[a-z]?\b/i,
			/\bHWV\s*\d+[a-z]?\b/i,
			/\b(?:KV|K\.)\s*\d+[a-z]?\b/i,
			/\bRV\s*\d+[a-z]?\b/i,
			/\bTH\s*\d+[a-z]?\b/,
			/\bHob\.?\s*[IVXL]+:\s*\d+\b/i,
			/\bH\.\s*\d+[a-z]?\b/,
			/\bD\.\s*\d{2,4}\b/,
			/\bOp\.?\s*\d+[a-z]?(?:\s*Nr\.?\s*\d+)?\b/i
		],
		categoryFolderPattern: /^\d+\s*\|\s*(.+)$/,
		// "Programm A-Orchester" → tag "A-Orchester"
		programFolderPattern: /^Programm\s+(.+)$/i,
		knownComposers: [
			'Andrew Lloyd Webber',
			'Anderson',
			'Bach',
			'Beethoven',
			'Bizet',
			'Brahms',
			'Charpentier',
			'Dvorak',
			'Dvořák',
			'Elgar',
			'Faure',
			'Fauré',
			'Gershwin',
			'Gliere',
			'Grieg',
			'Händel',
			'Haydn',
			'Holst',
			'Jenkins',
			'Lumbye',
			'Mendelssohn',
			'Mozart',
			'Mussorgsky',
			'Offenbach',
			'Purcell',
			'Rossini',
			'Schostakowitsch',
			'Schubert',
			'Schumann',
			'Smetana',
			'Strauss',
			'Telemann',
			'Tschaikowsky',
			'Verdi',
			'Vivaldi',
			'Wagner'
		],
		transpositions: {
			b: 'B',
			bb: 'B',
			es: 'Es',
			eb: 'Es',
			f: 'F',
			a: 'A',
			c: 'C',
			d: 'D',
			'hoch b': 'hoch B',
			'b flat': 'B',
			'e flat': 'Es'
		},
		partNotes: {
			vereinfacht: 'vereinfacht',
			easy: 'vereinfacht',
			fortgeschritten: 'Fortgeschritten',
			advanced: 'Fortgeschritten',
			duplikat: 'Duplikat',
			solo: 'Solo',
			notizen: 'mit Notizen',
			zusatzstimmen: 'Zusatzstimmen',
			fassung: 'Fassung'
		},
		movementNote: 'Satz'
	},

	events: {
		generalprobe: ['generalprobe'],
		probe: ['probe', 'stimmprobe', 'probentag', 'probenwochenende'],
		konzert: ['konzert', 'auftritt', 'matinee', 'serenade']
	},

	// EO = Ehemaligenorchester; the A and B orchestras may follow later.
	genres: ['Barock', 'Klassik', 'Romantik', 'Moderne', 'Filmmusik', 'Musical', 'Oper', 'Ballett', 'Pop', 'Rock', 'Jazz', 'Weihnachten', 'Marsch', 'Volksmusik'],
	roles: [
		{
			name: 'Dirigat',
			description: 'Plant Programme, sieht, wer kommt, und erfasst, wer da war.',
			rights: ['programme.bearbeiten', 'anmeldungen.sehen', 'anwesenheit.erfassen']
		},
		{ name: 'Notenwart', description: 'Pflegt Noten, Stücke und das Archiv.', rights: ['stuecke.bearbeiten', 'archiv.bearbeiten'] },
		{
			name: 'Orga',
			description: 'Organisiert Proben und Konzerte, plant Termine, sieht, wer kommt, und erfasst, wer da war.',
			rights: ['anmeldungen.sehen', 'anwesenheit.erfassen', 'termine.planen']
		},
		{
			name: 'Vorstand',
			description: 'Verwaltet Mitglieder und Rechte.',
			rights: ['mitglieder.verwalten', 'programme.bearbeiten', 'stuecke.bearbeiten', 'archiv.bearbeiten', 'anmeldungen.sehen', 'anwesenheit.erfassen', 'termine.planen']
		}
	],
	orchestras: ['EO', 'A', 'B'],
	splitSections: ['Geige'],

	// No sourceUrl: many members are kids and teens, and the repository leads to a personal profile.

	// Flexible arrangements: who reads from the C, B, Es and F parts, and the family parts.
	sharedParts: {
		'C-Stimmen': ['Flöte', 'Piccolo', 'Blockflöte', 'Oboe', 'Geige', 'Klavier', 'Synthesizer', 'Glockenspiel'],
		'B-Stimmen': ['Klarinette', 'Trompete', 'Sopran-Saxophon', 'Tenor-Saxophon'],
		'Es-Stimmen': ['Alt-Saxophon', 'Bariton-Saxophon'],
		'F-Stimmen': ['Horn', 'Englischhorn'],
		Holz: ['Flöte', 'Piccolo', 'Oboe', 'Englischhorn', 'Klarinette', 'Bassklarinette', 'Fagott'],
		Blech: ['Horn', 'Trompete', 'Posaune', 'Bassposaune', 'Bariton', 'Tuba'],
		Saxophon: ['Sopran-Saxophon', 'Alt-Saxophon', 'Tenor-Saxophon', 'Bariton-Saxophon'],
		Percussion: ['Schlagwerk', 'Pauke', 'Glockenspiel', 'Xylophon', 'Becken', 'Große Trommel', 'Trommel', 'Tamburin', 'Tamtam'],
		Schlagwerk: ['Percussion', 'Becken', 'Große Trommel', 'Trommel', 'Tamburin', 'Tamtam'],
		Continuo: ['Cembalo', 'Orgel', 'Violoncello', 'Kontrabass', 'Fagott'],
		// The pianist can rehearse from the piano reduction.
		Klavierauszug: ['Klavier'],
		// Most arrangements' bass guitar parts are played on the double bass.
		'E-Bass': ['Kontrabass']
	}
};
