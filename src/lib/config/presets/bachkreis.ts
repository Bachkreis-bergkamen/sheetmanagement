import type { Instrument, OrchestraConfig } from '../types.ts';

const CYMBALS = ['Crash-Becken', 'Ride-Becken', 'China-Becken', 'Hängendes Becken', 'Hi-Hat', 'Fingerzimbeln'];
const SMALL_PERCUSSION = [
	'Triangel', 'Tomtoms', 'Konzerttoms', 'Rototoms', 'Bongos', 'Congas', 'Djembe', 'Kuhglocke', 'Amboss', 'Claves', 'Holzblock', 'Tempelblocks',
	'Güiro', 'Maracas', 'Shaker', 'Regenmacher', 'Ratsche', 'Peitsche', 'Vibraslap', 'Flexaton', 'Schellen', 'Windspiel', 'Mark Tree',
	'Agogo Bells', 'Brake Drum', 'Steel Drums'
];
/** What a mallet part ("Mallet Percussion: Xylophon & Marimba") may hold. */
const MALLETS = ['Glockenspiel', 'Xylophon', 'Marimba', 'Vibraphon', 'Röhrenglocken', 'Crotales'];
/**
 * What a generic percussion part ("Percussion I: Triangel & Becken") may hold, the usual ones of
 * an orchestra first: the editor offers those and folds the rest away.
 */
const PERCUSSION_PARTS = [
	'Becken', 'Bass Drum', 'Snare Drum', 'Triangel', 'Tamburin', 'Glockenspiel', 'Xylophon', 'Tamtam', 'Röhrenglocken',
	'Hängendes Becken', 'Drumset', 'Trommel', ...CYMBALS.filter((cymbal) => cymbal !== 'Hängendes Becken'),
	...SMALL_PERCUSSION.filter((small) => small !== 'Triangel'), 'Marimba', 'Vibraphon', 'Crotales', 'Mallet Percussion'
];

/**
 * These used to be filed under "Percussion" and named "Percussion Triangle" and so on. Those
 * names still mean the instrument alone, not Percussion and the instrument.
 */
function withPercussionPrefix(instrument: Instrument): Instrument {
	if (![...SMALL_PERCUSSION, ...CYMBALS, 'Snare Drum'].includes(instrument.name)) return instrument;
	const words = [instrument.name, ...(instrument.aliases ?? [])];
	return { ...instrument, aliases: [...words.slice(1), ...words.map((word) => `Percussion ${word}`)] };
}

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

	instruments: (
	[
		{ name: 'Partitur', family: 'partitur', common: true, aliases: ['Score', 'Full Score', 'Direktion', 'Dirigent', 'Conductor', 'Gesamtausgabe', 'Gesammtausgabe', 'Ges', 'Full Orchestra'] },
		// Reductions of the score: for rehearsals at the piano, or a strings-only setting.
		{ name: 'Klavierauszug', family: 'partitur', common: true, aliases: ['Klavier-Auszug', 'Klavierauszüge', 'Piano Reduction', 'Piano Score', 'Piano Conductor', 'Vocal Score'] },
		{ name: 'Streicherauszug', family: 'partitur', common: true, aliases: ['Streicher-Auszug', 'String Reduction', 'Strings Reduction', 'String Score'] },

		{ name: 'Blockflöte', family: 'holz', aliases: ['Recorder', 'Recorders'] },
		{ name: 'Tenor-Blockflöte', family: 'holz', aliases: ['Tenorblockflöte', 'Tenor Recorder'] },
		{ name: 'Piccolo', family: 'holz', common: true, aliases: ['Piccoloflöte', 'Picc'] },
		{ name: 'Flöte', family: 'holz', common: true, aliases: ['Flöten', 'Querflöte', 'Floete', 'Flute', 'Flutes'] },
		{ name: 'Oboe', family: 'holz', common: true, aliases: ['Oboen', 'Oboes'] },
		{ name: 'Englischhorn', family: 'holz', aliases: ['English Horn', 'Cor Anglais'] },
		{ name: 'Klarinette', family: 'holz', common: true, aliases: ['Klarinetten', 'Clarinet', 'Clarinets', 'Clarinette', 'Clarinettes', 'Clarinett', 'Calarinet', 'Clari'] },
		{ name: 'Altklarinette', family: 'holz', aliases: ['Alto Clarinet', 'Alto Clarinets', 'Alt-Klarinette', 'Alt Klarinette', 'Alto Clari'] },
		{ name: 'Bassklarinette', family: 'holz', common: true, aliases: ['Bass Clarinet', 'Bass Clari', 'Bass Klarinette'] },
		{ name: 'Fagott', family: 'holz', common: true, aliases: ['Fagotte', 'Bassoon', 'Bassoons', 'Bassoonpdf', 'Basson', 'Bassons'] },
		{ name: 'Sopran-Saxophon', family: 'holz', aliases: ['Sopransaxophon', 'Soprano Sax', 'Sopransax', 'Soprano Saxophone'] },
		{ name: 'Alt-Saxophon', family: 'holz', common: true, aliases: ['Altsaxophon', 'Alt Sax', 'Alto Sax', 'Alto Saxophone', 'Altsax', 'Alt Saxphone', 'Alt Saxophone', 'Alt Saxophon', 'Alto Saxophon'] },
		{ name: 'Tenor-Saxophon', family: 'holz', aliases: ['Tenorsaxophon', 'Tenor Sax', 'Tenor Saxophone', 'Tenorsax', 'Tenor Saxophon'] },
		{ name: 'Bariton-Saxophon', family: 'holz', aliases: ['Baritonsaxophon', 'Bari Sax', 'Baritone Sax', 'Baritonsax', 'Bariton Sax', 'Baritone Saxophone', 'Bariton Saxophon'] },
		{ name: 'Saxophon', family: 'holz', aliases: ['Sax', 'Saxophone', 'Saxphone'] },
		{ name: 'Holz', family: 'holz', aliases: ['Holzbläser', 'Woodwinds'] },

		{ name: 'Horn', family: 'blech', common: true, aliases: ['Hörner', 'Waldhorn', 'French Horn', 'Horns'] },
		{ name: 'Trompete', family: 'blech', common: true, aliases: ['Trompeten', 'Trumpet', 'Trumpets'] },
		{ name: 'Posaune', family: 'blech', common: true, aliases: ['Posaunen', 'Trombone', 'Trombones', 'Tombone', 'Pos'] },
		{ name: 'Bassposaune', family: 'blech', aliases: ['Bass Trombone', 'Bass Posaune'] },
		{ name: 'Bariton', family: 'blech', aliases: ['Baritone', 'Euphonium'] },
		{ name: 'Tuba', family: 'blech', common: true, aliases: ['Basstuba', 'Bass Tuba'] },
		{ name: 'Blech', family: 'blech', aliases: ['Blechbläser', 'Brass'] },

		{ name: 'Pauke', family: 'schlagwerk', common: true, aliases: ['Pauken', 'Timpani', 'Timp', 'Timpano', 'Kettledrums'] },
		{ name: 'Schlagwerk', family: 'schlagwerk', common: true, aliases: ['Schlagzeug'], holds: PERCUSSION_PARTS },
		// The drum kit of pop and big band arrangements; German players say Drumset too (#317).
		{ name: 'Drumset', family: 'schlagwerk', aliases: ['Drum Set', 'Drum Kit', 'Drumkit', 'Drums'] },
		{
			name: 'Percussion',
			family: 'schlagwerk',
			aliases: ['Perc', 'Kleines Schlagwerk', 'Auxiliary Percussion', 'Aux Perc'],
			holds: PERCUSSION_PARTS,
			// Small percussion: no instrument of its own, but named, since a piece often has several.
			variants: ['Low Drum', 'Kastagnetten', 'Castanets', 'Cabasa', 'Timbales', 'Cajon']
		},
		// Small percussion with parts of its own.
		{ name: 'Triangel', family: 'schlagwerk', aliases: ['Triangle', 'Triangolo'] },
		// Snare and bass drum keep their English names in German too (#317); the German words still read.
		{ name: 'Snare Drum', family: 'schlagwerk', aliases: ['Kleine Trommel', 'Snare', 'Snaredrum'] },
		{ name: 'Tomtoms', family: 'schlagwerk', aliases: ['Tom-Toms', 'Tom Toms', 'Toms', 'Tom Drums'] },
		{ name: 'Konzerttoms', family: 'schlagwerk', aliases: ['Concert Toms', 'Konzert-Toms', 'Concert Tom'] },
		{ name: 'Rototoms', family: 'schlagwerk', aliases: ['Rototom', 'Roto Toms', 'Roto-Toms'] },
		{ name: 'Bongos', family: 'schlagwerk', aliases: ['Bongo'] },
		{ name: 'Congas', family: 'schlagwerk', aliases: ['Conga', 'Tumba'] },
		{ name: 'Djembe', family: 'schlagwerk', aliases: ['Djembé'] },
		{ name: 'Hi-Hat', family: 'schlagwerk', aliases: ['Hihat', 'Hi Hat'] },
		{ name: 'Crash-Becken', family: 'schlagwerk', aliases: ['Crash Cymbal', 'Crash Cymbals', 'Crashbecken'] },
		{ name: 'Ride-Becken', family: 'schlagwerk', aliases: ['Ride Cymbal', 'Ridebecken'] },
		{ name: 'China-Becken', family: 'schlagwerk', aliases: ['China Cymbal', 'Chinabecken'] },
		{ name: 'Hängendes Becken', family: 'schlagwerk', aliases: ['Suspended Cymbal', 'Sus Cymbal', 'Susp Cymbal', 'Freihängendes Becken'] },
		{ name: 'Fingerzimbeln', family: 'schlagwerk', aliases: ['Finger Cymbals', 'Zimbeln'] },
		{ name: 'Kuhglocke', family: 'schlagwerk', aliases: ['Cowbell', 'Cow Bell', 'Kuhglocken'] },
		{ name: 'Amboss', family: 'schlagwerk', aliases: ['Anvil', 'Amboß'] },
		{ name: 'Claves', family: 'schlagwerk', aliases: ['Klanghölzer'] },
		{ name: 'Holzblock', family: 'schlagwerk', aliases: ['Wood Block', 'Woodblock', 'Holzblocktrommel'] },
		{ name: 'Tempelblocks', family: 'schlagwerk', aliases: ['Temple Blocks', 'Temple Block', 'Tempelblock'] },
		{ name: 'Güiro', family: 'schlagwerk', aliases: ['Guiro'] },
		{ name: 'Maracas', family: 'schlagwerk', aliases: ['Rumbakugeln'] },
		{ name: 'Shaker', family: 'schlagwerk', aliases: ['Shakers', 'Egg Shaker'] },
		{ name: 'Regenmacher', family: 'schlagwerk', aliases: ['Rainstick', 'Rain Stick', 'Regenstab'] },
		{ name: 'Ratsche', family: 'schlagwerk', aliases: ['Ratchet'] },
		{ name: 'Peitsche', family: 'schlagwerk', aliases: ['Whip', 'Slapstick'] },
		{ name: 'Vibraslap', family: 'schlagwerk', aliases: ['Vibra Slap'] },
		{ name: 'Flexaton', family: 'schlagwerk', aliases: ['Flexatone'] },
		{ name: 'Schellen', family: 'schlagwerk', aliases: ['Sleigh Bells', 'Schlittenglocken', 'Schellenkranz'] },
		{ name: 'Windspiel', family: 'schlagwerk', aliases: ['Wind Chimes', 'Windchimes', 'Glass Chimes'] },
		{ name: 'Mark Tree', family: 'schlagwerk', aliases: ['Marktree', 'Bar Chimes', 'Barchimes', 'Chimes Tree'] },
		{ name: 'Agogo Bells', family: 'schlagwerk', aliases: ['Agogo', 'Agogô', 'Agogo Bell'] },
		{ name: 'Brake Drum', family: 'schlagwerk', aliases: ['Brake Drums', 'Bremstrommel', 'Bremstrommeln', 'Automobile Brake Drum', 'Auto Brake Drum'] },
		{ name: 'Steel Drums', family: 'schlagwerk', aliases: ['Steel Drum', 'Steeldrum', 'Steeldrums', 'Steel Pan', 'Steelpan', 'Steel Pans', 'Steelpans'] },
		{
			name: 'Mallet Percussion',
			common: true,
			family: 'schlagwerk',
			aliases: ['Mallets', 'Mallet Perc', 'Stabspiele'],
			// A part for several players like Percussion: "Mallet Percussion I: Xylophon & Glockenspiel".
			holds: MALLETS
		},
		{ name: 'Röhrenglocken', family: 'schlagwerk', aliases: ['Röhrenglocke', 'Tubular Bells', 'Tubular Bell', 'Chimes', 'Campane', 'Campanelle tubolari'] },
		{ name: 'Crotales', family: 'schlagwerk', aliases: ['Crotale', 'Antike Zimbeln', 'Antique Cymbals', 'Cymbales antiques'] },
		{ name: 'Marimba', family: 'schlagwerk', aliases: ['Marimbaphon', 'Marimbafon', 'Marimbaphone'] },
		{ name: 'Vibraphon', family: 'schlagwerk', aliases: ['Vibraphone', 'Vibrafon', 'Vibes', 'Vibraharp'] },
		{ name: 'Glockenspiel', family: 'schlagwerk', aliases: ['Bells', 'Orchestra Bells', 'Orchestral Bells'] },
		{ name: 'Xylophon', family: 'schlagwerk', aliases: ['Xylophone'] },
		{ name: 'Becken', family: 'schlagwerk', aliases: ['Cymbals', 'Cymbal', 'Piatti', 'Clash Cymbals', 'Beckenpaar'] },
		{ name: 'Bass Drum', family: 'schlagwerk', aliases: ['Große Trommel', 'Grosse Trommel', 'Gran Cassa', 'Gran Casa', 'Grancassa', 'Gran-Cassa', 'Bassdrum'] },
		{ name: 'Trommel', family: 'schlagwerk', aliases: ['Rührtrommel', 'Marschtrommel', 'Field Drum', 'Tenor Drum'] },
		{ name: 'Tamburin', family: 'schlagwerk', aliases: ['Tambourine'] },
		{ name: 'Tamtam', family: 'schlagwerk', aliases: ['Tam Tam', 'Gong'] },

		{ name: 'Cembalo', family: 'tasten', aliases: ['Harpsichord'] },
		{ name: 'Klavier', family: 'tasten', common: true, aliases: ['Piano'] },
		{ name: 'Orgel', family: 'tasten', aliases: ['Organ'] },
		{ name: 'Synthesizer', family: 'tasten', common: true, aliases: ['Synth', 'Keyboard', 'Roland', 'Roland SP700', 'Roland SP 700'] },
		{ name: 'Harfe', family: 'tasten', aliases: ['Harp'] },
		{ name: 'Continuo', family: 'tasten', aliases: ['Basso Continuo'] },

		{ name: 'Sopran', family: 'gesang', aliases: ['Soprano', 'Sopranstimme'] },
		{ name: 'Alt', family: 'gesang', aliases: ['Alto', 'Altstimme'] },
		{ name: 'Tenor', family: 'gesang', aliases: ['Tenore', 'Tenorstimme'] },
		// A bare "Bass" in a file name is the double bass, so the sung bass needs the longer word.
		{ name: 'Bassstimme', label: 'Bass', family: 'gesang', aliases: ['Bass Voice', 'Basso', 'Chorbass', 'Gesangsbass'] },
		{ name: 'Chor', family: 'gesang', aliases: ['SATB', 'Choir', 'Gemischter Chor', 'Mixed Choir'], holds: ['Sopran', 'Alt', 'Tenor', 'Bassstimme'] },
		{ name: 'Frauenchor', family: 'gesang', aliases: ['Female Choir', 'Women’s Choir', "Women's Choir", 'Womens Choir', 'Damenchor', 'SSA', 'SSAA'], holds: ['Sopran', 'Alt'] },
		{ name: 'Männerchor', family: 'gesang', aliases: ['Male Choir', 'Men’s Choir', "Men's Choir", 'Mens Choir', 'Herrenchor', 'TTB', 'TTBB'], holds: ['Tenor', 'Bassstimme'] },
		{ name: 'Gesang', family: 'gesang', aliases: ['Vocals', 'Vocal'] },

		{ name: 'C-Stimmen', family: 'sonstige' },
		{ name: 'B-Stimmen', family: 'sonstige' },
		{ name: 'Es-Stimmen', family: 'sonstige' },
		{ name: 'F-Stimmen', family: 'sonstige' },
		{ name: 'Stimme', family: 'sonstige', aliases: ['Part'], voice: true },

		// The app says Geige · Bratsche · Cello · Kontrabass; the files keep their words (Viola, Violoncello).
		{ name: 'Geige', family: 'streicher', common: true, aliases: ['Geigen', 'Violine', 'Violinen', 'Violin', 'Violins'] },
		{ name: 'Viola', label: 'Bratsche', family: 'streicher', common: true, aliases: ['Violen', 'Bratsche', 'Bratschen', 'Violas', 'Vioa'] },
		{ name: 'Violoncello', label: 'Cello', family: 'streicher', common: true, aliases: ['Cello', 'Celli', 'Cellos', 'Violoncellos', 'Violincello'] },
		{
			name: 'Kontrabass',
			family: 'streicher',
			common: true,
			aliases: ['Kontrabässe', 'Contrabass', 'Contrabasses', 'Double Bass', 'String Bass', 'Stringbass', 'Bass']
		},
		{ name: 'E-Bass', family: 'streicher', aliases: ['Bass Guitar', 'Electric Bass', 'E Bass'] }
	] satisfies Instrument[]
	).map(withPercussionPrefix),

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
			e: 'E',
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
			zusatzstimme: 'Zusatzstimme',
			fassung: 'Fassung'
		},
		movementNote: 'Satz',
		ignoredWords: ['imslp']
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
			rights: ['programme.bearbeiten', 'anmeldungen.sehen', 'anwesenheit.erfassen', 'kummerkasten.lesen', 'ueben.begleiten']
		},
		{ name: 'Notenwart', description: 'Pflegt Noten, Stücke und das Archiv.', rights: ['stuecke.bearbeiten', 'archiv.bearbeiten'] },
		{
			name: 'Orga',
			description: 'Organisiert Proben und Konzerte, plant Termine, sieht, wer kommt, und erfasst, wer da war.',
			rights: ['anmeldungen.sehen', 'anwesenheit.erfassen', 'termine.planen', 'kummerkasten.lesen']
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
		'Es-Stimmen': ['Alt-Saxophon', 'Bariton-Saxophon', 'Altklarinette'],
		'F-Stimmen': ['Horn', 'Englischhorn'],
		Holz: ['Flöte', 'Piccolo', 'Oboe', 'Englischhorn', 'Klarinette', 'Altklarinette', 'Bassklarinette', 'Fagott'],
		Blech: ['Horn', 'Trompete', 'Posaune', 'Bassposaune', 'Bariton', 'Tuba'],
		Saxophon: ['Sopran-Saxophon', 'Alt-Saxophon', 'Tenor-Saxophon', 'Bariton-Saxophon'],
		Percussion: ['Schlagwerk', 'Pauke', 'Glockenspiel', 'Xylophon', 'Becken', 'Bass Drum', 'Trommel', 'Tamburin', 'Tamtam'],
		Schlagwerk: ['Percussion', 'Becken', 'Bass Drum', 'Trommel', 'Tamburin', 'Tamtam'],
		// The percussionists play the drum kit.
		Drumset: ['Schlagwerk', 'Percussion'],
		// Small percussion with parts of its own is played by the percussionists, as it was under "Percussion".
		...Object.fromEntries(SMALL_PERCUSSION.map((name) => [name, ['Schlagwerk', 'Percussion']])),
		'Snare Drum': ['Trommel', 'Schlagwerk', 'Percussion'],
		// Marimba and vibraphone were under "Mallet Percussion" and are played by its players.
		Marimba: ['Mallet Percussion', 'Schlagwerk', 'Percussion'],
		Vibraphon: ['Mallet Percussion', 'Schlagwerk', 'Percussion'],
		Röhrenglocken: ['Mallet Percussion', 'Schlagwerk', 'Percussion'],
		Crotales: ['Mallet Percussion', 'Schlagwerk', 'Percussion'],
		...Object.fromEntries(CYMBALS.map((name) => [name, ['Becken', 'Schlagwerk', 'Percussion']])),
		// Choir parts: each voice sings from them.
		Chor: ['Sopran', 'Alt', 'Tenor', 'Bassstimme', 'Gesang'],
		Frauenchor: ['Sopran', 'Alt'],
		Männerchor: ['Tenor', 'Bassstimme'],
		Continuo: ['Cembalo', 'Orgel', 'Violoncello', 'Kontrabass', 'Fagott'],
		// The pianist can rehearse from the piano reduction.
		Klavierauszug: ['Klavier'],
		// Most arrangements' bass guitar parts are played on the double bass.
		'E-Bass': ['Kontrabass']
	},

	// What a percussionist ticks in their profile, not each of the 50 instruments: not everyone
	// plays the mallets or has congas at home. "Schlagwerk (Trommeln, Stabspiele ohne Marimba)".
	instrumentSets: {
		Trommeln: ['Snare Drum', 'Bass Drum', 'Trommel', 'Tomtoms', 'Konzerttoms', 'Rototoms'],
		'Becken und Gongs': ['Becken', 'Hängendes Becken', 'Crash-Becken', 'Ride-Becken', 'China-Becken', 'Hi-Hat', 'Fingerzimbeln', 'Tamtam'],
		Kleinpercussion: ['Triangel', 'Tamburin', 'Schellen', 'Holzblock', 'Tempelblocks', 'Claves', 'Kuhglocke', 'Maracas', 'Shaker', 'Güiro', 'Agogo Bells'],
		Effekte: ['Ratsche', 'Peitsche', 'Vibraslap', 'Flexaton', 'Regenmacher', 'Windspiel', 'Mark Tree', 'Amboss', 'Brake Drum'],
		'Latin und Karibik': ['Bongos', 'Congas', 'Djembe', 'Steel Drums'],
		Stabspiele: ['Glockenspiel', 'Xylophon', 'Marimba', 'Vibraphon', 'Röhrenglocken', 'Crotales', 'Mallet Percussion'],
		Drumset: ['Drumset'],
		Pauken: ['Pauke']
	}
};
