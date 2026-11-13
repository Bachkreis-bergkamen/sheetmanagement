import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { LAYOUT, type TabKey } from '#lib/repertoire/sheet.ts';
import { eventDay } from '#lib/repertoire/dates.ts';

/**
 * Invented sample data for the demo mode (#121): an archive in Drive, a calendar around
 * today and a filled-in Repertoire sheet. Piece titles are public works; people, emails and
 * places are made up. Ids are fixed, so links stay the same between restarts.
 */

export const DEMO_IDS = {
	archive: 'demo-archive-folder',
	program: 'demo-program-folder',
	calendar: 'demo-calendar@example.org',
	sheet: 'demo-repertoire-sheet'
};

export const DEMO_ADMIN = { email: 'verwaltung@example.org', name: 'Vera Verwaltung' };
export const DEMO_MEMBER = { email: 'mia@example.org', name: 'Mia Beispiel' };
/** Mia's mother: a parent account, which sees only the parents' area. */
export const DEMO_PARENT = { email: 'eltern@example.org', name: 'Petra Beispiel' };
/** Plays next to the demo member and offers her the notes in one part. */
export const DEMO_DESK_PARTNER = { email: 'greta@example.org', name: 'Greta Pult' };

export interface DemoFile {
	id: string;
	name: string;
	mimeType: string;
	parents: string[];
	modifiedTime: string;
	shortcutDetails?: { targetId: string; targetMimeType: string };
	/** For the generated PDF. */
	pdf?: { title: string; composer?: string; arranger?: string; part: string; pages?: number; staves?: string[] };
}

export interface DemoEvent {
	id: string;
	summary: string;
	location?: string;
	description?: string;
	start: { date?: string; dateTime?: string };
	end: { date?: string; dateTime?: string };
	extendedProperties?: { shared?: Record<string, string | null> };
}

const FOLDER = 'application/vnd.google-apps.folder';
const SHORTCUT = 'application/vnd.google-apps.shortcut';
const PDF = 'application/pdf';
const DOC = 'application/vnd.google-apps.document';
const MODIFIED = '2026-09-01T12:00:00Z';

const STRINGS = ['Geige I', 'Geige II', 'Viola', 'Violoncello', 'Kontrabass'];
const WINDS = ['Flöte', 'Oboe', 'Klarinette in B', 'Fagott', 'Horn in F', 'Trompete in B'];
/** The score and its reductions, named with the "@" prefix. */
const SCORES = ['Partitur', 'Klavierauszug', 'Streicherauszug'];

interface SamplePiece {
	id: string;
	folder: string;
	short: string;
	title: string;
	composer?: string;
	arranger?: string;
	/** "Dauer" and "Verlag" in the sheet; some left empty, so the gaps show. */
	duration?: string;
	publisher?: string;
	category?: 'christmas';
	parts: string[];
	/** Parts with a status word: a placeholder doc for FEHLT, a PDF otherwise. */
	gaps?: Record<string, 'FEHLT' | 'LEER' | 'UNVOLLSTÄNDIG'>;
	/** A score's instrument names, at the left of its staves (#249). */
	staves?: string[];
	/** Old file names as scanned years ago, for trying the naming check on /namen. */
	rawNames?: string[];
	/** Pages per part (one without), and parts with fewer, so the completeness check (#93) has something to find. */
	pages?: { all: number; short?: Record<string, number> };
}

const PIECES: SamplePiece[] = [
	{
		id: 'demo-cancan',
		folder: 'Offenbach - Can-Can',
		short: 'Can-Can',
		title: 'Can-Can',
		composer: 'Jacques Offenbach',
		duration: '2:30',
		parts: [],
		rawNames: [
			'Can-Can_Score.pdf',
			'Can-Can_Flute1.pdf',
			'Can Can - Clarinet in Bb 1.pdf',
			'Can Can - Trumpet in Bb 2.pdf',
			'can-can violin1.pdf',
			'can-can violin2.pdf',
			'Can-Can-Viola.pdf',
			'Can-Can-Cello.pdf',
			'Can-Can-Bass.pdf',
			'Can Can Timpani.pdf',
			'Can-Can - Percussion.pdf',
			'Can-Can - Horn in F.pdf',
			// One the check can't read, to show what "unklar" looks like.
			'CanCan_Kopie_alt.pdf'
		]
	},
	{
		id: 'demo-nachtmusik',
		folder: 'Mozart KV 525 - Eine kleine Nachtmusik',
		// Longer than a phone shows well: /namen suggests "Kleine Nachtmusik".
		short: 'Eine kleine Nachtmusik',
		title: 'Eine kleine Nachtmusik',
		composer: 'Wolfgang Amadeus Mozart',
		duration: '17:30',
		publisher: 'Bärenreiter',
		parts: ['Partitur', ...STRINGS]
	},
	{
		id: 'demo-egmont',
		folder: 'Beethoven Op. 84 - Egmont Ouvertüre',
		short: 'Egmont',
		title: 'Egmont Ouvertüre',
		composer: 'Ludwig van Beethoven',
		duration: '8:30',
		publisher: 'Breitkopf & Härtel',
		parts: ['Partitur', ...WINDS, 'Pauke', ...STRINGS],
		gaps: { Kontrabass: 'FEHLT' },
		// As the score names them: with a piccolo the archive has no part for (#249).
		staves: ['Ottavino', 'Flauti a 2', 'Oboi a 2', 'Clarinetti in B a 2', 'Fagotti a 2', 'Corni in F I. II.', 'Trombe in C', 'Timpani', 'Violino I', 'Violino II', 'Viola', 'Violoncello e Basso']
	},
	{
		id: 'demo-jesu',
		folder: 'Bach BWV 147 - Jesu bleibet meine Freude',
		short: 'Jesu bleibet',
		title: 'Jesu bleibet meine Freude',
		composer: 'Johann Sebastian Bach',
		duration: '3:30',
		parts: ['Partitur', 'Oboe', ...STRINGS, 'Klavierauszug'],
		gaps: { Viola: 'UNVOLLSTÄNDIG' }
	},
	{
		id: 'demo-morgenstimmung',
		folder: 'Grieg Op. 46 - Morgenstimmung',
		short: 'Morgenstimmung',
		title: 'Morgenstimmung',
		composer: 'Edvard Grieg',
		duration: '3:45',
		publisher: 'Edition Peters',
		parts: ['Partitur', 'Flöte', 'Oboe', 'Klarinette in B', 'Horn in F', ...STRINGS, 'Streicherauszug']
	},
	{
		id: 'demo-007',
		folder: 'Themes from 007',
		short: '007',
		title: 'Themes from 007',
		composer: 'John Barry',
		arranger: 'Mia Musterfrau',
		publisher: 'Hal Leonard',
		parts: ['Partitur', 'Flöte', 'Klarinette in B', 'Alt-Saxophon', 'Trompete in B', 'Posaune', 'Schlagwerk', ...STRINGS]
	},
	{
		id: 'demo-sleigh',
		folder: 'Sleigh Ride',
		short: 'Sleigh Ride',
		title: 'Sleigh Ride',
		composer: 'Leroy Anderson',
		category: 'christmas',
		duration: '3:00',
		publisher: 'Mills Music',
		parts: ['Partitur', 'Flöte', 'Trompete in B', 'Schlagwerk', ...STRINGS],
		// The second violins' copy lost two pages; nobody has noticed yet.
		pages: { all: 3, short: { 'Geige II': 1 } }
	},
	{
		id: 'demo-stille-nacht',
		folder: 'Stille Nacht',
		short: 'Stille Nacht',
		title: 'Stille Nacht',
		composer: 'Franz Xaver Gruber',
		arranger: 'Paul Probe',
		category: 'christmas',
		duration: '3:15',
		parts: ['Partitur', ...STRINGS],
		gaps: { Violoncello: 'LEER' }
	}
];

/** The archive: piece folders, a Christmas category folder, and a current-programme folder with shortcuts. */
export function demoFiles(): DemoFile[] {
	const christmas = 'demo-category-christmas';
	const eo = 'demo-program-eo';
	const files: DemoFile[] = [
		{ id: DEMO_IDS.archive, name: '90 | Notenarchiv', mimeType: FOLDER, parents: ['demo-root'], modifiedTime: MODIFIED },
		{ id: DEMO_IDS.program, name: '01 | Aktuelles Programm', mimeType: FOLDER, parents: ['demo-root'], modifiedTime: MODIFIED },
		{ id: christmas, name: '00 | Weihnachtsstücke', mimeType: FOLDER, parents: [DEMO_IDS.archive], modifiedTime: MODIFIED },
		{ id: eo, name: 'Programm Ehemaligenorchester', mimeType: FOLDER, parents: [DEMO_IDS.program], modifiedTime: MODIFIED }
	];
	for (const piece of PIECES) {
		files.push({
			id: piece.id,
			name: piece.folder,
			mimeType: FOLDER,
			parents: [piece.category ? christmas : DEMO_IDS.archive],
			modifiedTime: MODIFIED
		});
		piece.rawNames?.forEach((name, i) => {
			files.push({
				id: `${piece.id}-raw-${i}`,
				name,
				mimeType: PDF,
				parents: [piece.id],
				modifiedTime: MODIFIED,
				pdf: { title: piece.title, composer: piece.composer, part: name.replace(/\.pdf$/i, '') }
			});
		});
		piece.parts.forEach((part, i) => {
			const gap = piece.gaps?.[part];
			const prefix = SCORES.includes(part) ? '@' : '';
			files.push({
				id: `${piece.id}-${i}`,
				name: `${prefix}${piece.short} - ${part}${gap ? ` - ${gap}` : ''}${gap === 'FEHLT' ? '' : '.pdf'}`,
				mimeType: gap === 'FEHLT' ? DOC : PDF,
				parents: [piece.id],
				modifiedTime: MODIFIED,
				pdf:
					gap === 'FEHLT'
						? undefined
						: {
								title: piece.title,
								composer: piece.composer,
								arranger: piece.arranger,
								part,
								pages: piece.pages?.short?.[part] ?? piece.pages?.all,
								...(part === 'Partitur' && piece.staves ? { staves: piece.staves } : {})
							}
			});
		});
	}
	// The next concert's pieces, linked into the current programme like people do by hand.
	for (const id of ['demo-egmont', 'demo-morgenstimmung', 'demo-007', 'demo-nachtmusik']) {
		const piece = PIECES.find((p) => p.id === id)!;
		files.push({
			id: `${id}-shortcut`,
			name: piece.folder,
			mimeType: SHORTCUT,
			parents: [eo],
			modifiedTime: MODIFIED,
			shortcutDetails: { targetId: id, targetMimeType: FOLDER }
		});
	}
	return files;
}

const DAY_MS = 86_400_000;

/** Days from today, in the orchestra's time zone, as "2026-10-24". */
function day(offset: number, now: number): string {
	return eventDay({ start: new Date(now + offset * DAY_MS).toISOString(), allDay: false }, config.timeZone);
}

/** Rehearsals and concerts around today, so there's always something upcoming and something past. */
export function demoEvents(now: number): DemoEvent[] {
	const timed = (id: string, summary: string, offset: number, from: string, to: string, location = 'Aula, Musterschule'): DemoEvent => ({
		id,
		summary,
		location,
		start: { dateTime: `${day(offset, now)}T${from}:00` },
		end: { dateTime: `${day(offset, now)}T${to}:00` }
	});
	return [
		timed('demo-sommerkonzert', 'Sommerkonzert', -60, '17:00', '19:00', 'Stadthalle Musterstadt'),
		timed('demo-probe-1', 'Probe Herbstkonzert 🎶', -10, '10:00', '13:00'),
		timed('demo-probe-2', 'Probe Herbstkonzert 🎶', -3, '10:00', '13:00'),
		timed('demo-probe-3', 'Probe Herbstkonzert 🎶', 4, '10:00', '13:00'),
		// Only for A, which plays the Herbstkonzert with EO: the demo member (EO) doesn't see it.
		timed('demo-probe-a', 'Probe Herbstkonzert (A)', 7, '18:00', '21:00'),
		timed('demo-probe-4', 'Probe Herbstkonzert 🎶', 11, '10:00', '13:00'),
		timed('demo-probe-5', 'Probe Herbstkonzert 🎶', 18, '10:00', '13:00'),
		timed('demo-generalprobe', 'Generalprobe Herbstkonzert', 24, '15:00', '18:00', 'Stadthalle Musterstadt'),
		{
			...timed('demo-herbstkonzert', 'Herbstkonzert', 25, '17:00', '19:00', 'Stadthalle Musterstadt'),
			description: 'Einlass ab 16:30. Eintritt frei, Spenden willkommen.'
		},
		timed('demo-probenwochenende', 'Probenwochenende (?)', 39, '10:00', '17:00', 'Jugendherberge am See'),
		timed('demo-probe-weihnacht-1', 'Probe Weihnachtskonzert', 46, '10:00', '13:00'),
		timed('demo-probe-weihnacht-2', 'Probe Weihnachtskonzert', 53, '10:00', '13:00'),
		timed('demo-weihnacht-1', '1. Weihnachtskonzert', 60, '17:00', '18:30', 'Kirche am Markt'),
		timed('demo-weihnacht-2', '2. Weihnachtskonzert', 61, '17:00', '18:30', 'Kirche am Markt')
	];
}

/** A tab with its header row from the app's own layout, and rows given by column key. */
function tab<K extends TabKey>(key: K, rows: Partial<Record<keyof (typeof LAYOUT)[K]['columns'] & string, string>>[]): [string, string[][]] {
	const columns = LAYOUT[key].columns as Record<string, string>;
	const keys = Object.keys(columns);
	return [LAYOUT[key].tab, [keys.map((k) => columns[k]), ...rows.map((row) => keys.map((k) => (row as Record<string, string>)[k] ?? ''))]];
}

/** The Repertoire sheet, filled in as if the orchestra had used the app for a while. */
export function demoSheet(now: number): Map<string, string[][]> {
	const herbst = `Herbstkonzert ${day(25, now).slice(0, 4)}`;
	const weihnacht = `Weihnachtskonzert ${day(60, now).slice(0, 4)}`;
	const weihnacht2 = `${weihnacht} (${day(61, now).slice(8, 10)}.${day(61, now).slice(5, 7)}.)`;
	const sommer = `Sommerkonzert ${day(-60, now).slice(0, 4)}`;
	const label = (offset: number) => `Probe Herbstkonzert 🎶 · ${day(offset, now)}`;
	const titles = Object.fromEntries(PIECES.map((p) => [p.id, p.title]));
	const at = (offset: number) => day(offset, now);
	const program = (concert: string, pieces: string[], orchestra = '') => pieces.map((piece, i) => ({ concert, position: String(i + 1), piece, orchestra }));

	return new Map([
		tab('pieces', [
			...PIECES.map((p) => ({
				title: p.title,
				composer: p.composer?.split(' ').at(-1) ?? '',
				// The full name for the GEMA list (#146), filled in for some, so the gaps show.
				composerFull: ['demo-egmont', 'demo-nachtmusik', 'demo-jesu', 'demo-sleigh'].includes(p.id) ? (p.composer ?? '') : '',
				arranger: p.arranger ?? '',
				duration: p.duration ?? '',
				publisher: p.publisher ?? '',
				// Film music shows the film's logo on its banner (#312).
				...(p.id === 'demo-007' ? { genre: 'Filmmusik' } : {}),
				driveFolderId: p.id
			})),
			// Played long ago, no sheet music in the archive.
			{ title: 'Ungarischer Tanz Nr. 5', composer: 'Brahms', genre: 'Romantik' },
			// A medley: its songs in "Inhalt", the composers come from there ("Bizet, Offenbach und mehr").
			{
				title: 'Operetten-Potpourri',
				arranger: 'Hans Kolditz',
				genre: 'Operette',
				contents: [
					'Habanera – Bizet',
					'Barcarole – Offenbach',
					'Fledermaus-Ouvertüre – Johann Strauss',
					'Lippen schweigen – Lehár',
					'Leichte Kavallerie – Suppé',
					'Grüß mir mein Wien – Kálmán'
				].join('\n')
			},
			// One written the old way: every composer in "Komponist", the songs in the note.
			{
				title: 'Musical-Highlights',
				composer: 'Andrew Lloyd Webber, Claude-Michel Schönberg, Leonard Bernstein, Frederick Loewe, Jerry Bock',
				genre: 'Musical',
				notes: 'Memory, Bring Him Home, Tonight, I Could Have Danced All Night, If I Were a Rich Man'
			}
		]),
		tab('concerts', [
			// The orchestra's history for the Chronik (#61): some only known by year or month.
			{ date: '1962-12', title: 'Weihnachtskonzert 1962', location: 'Alte Turnhalle', orchestra: 'EO' },
			{ date: '1975', title: 'Sommerkonzert 1975', location: 'Stadtpark', orchestra: 'EO' },
			{ date: '1987-10-03', title: 'Jubiläumskonzert 25 Jahre', location: 'Stadthalle Musterstadt', orchestra: 'EO' },
			{ date: '1998-04', title: 'Frühjahrskonzert 1998', orchestra: 'EO' },
			{ date: '2004-12-18', title: 'Weihnachtskonzert 2004', location: 'Kirche am Markt', orchestra: 'EO' },
			{ date: '2012-05', title: 'Frühjahrskonzert 2012', location: 'Aula, Musterschule', orchestra: 'EO' },
			{ date: at(-60), title: sommer, location: 'Stadthalle Musterstadt', orchestra: 'EO', eventId: 'demo-sommerkonzert' },
			// Played together: each orchestra with its own programme.
			{ date: at(25), title: herbst, location: 'Stadthalle Musterstadt', orchestra: 'EO, A', eventId: 'demo-herbstkonzert' },
			// Given with a guest choir: its own pieces, and one they sing with us.
			{ date: at(60), title: weihnacht, location: 'Kirche am Markt', orchestra: 'EO', eventId: 'demo-weihnacht-1', partners: 'KCH' },
			{ date: at(61), title: weihnacht2, location: 'Kirche am Markt', orchestra: 'EO', eventId: 'demo-weihnacht-2', sameProgramAs: weihnacht }
		]),
		tab('program', [
			...program('Weihnachtskonzert 1962', ['Stille Nacht', 'Ungarischer Tanz Nr. 5']),
			...program('Sommerkonzert 1975', [titles['demo-nachtmusik'], 'Ungarischer Tanz Nr. 5']),
			...program('Jubiläumskonzert 25 Jahre', [titles['demo-egmont'], titles['demo-nachtmusik'], 'Ungarischer Tanz Nr. 5']),
			...program('Frühjahrskonzert 1998', [titles['demo-nachtmusik'], titles['demo-morgenstimmung']]),
			...program('Weihnachtskonzert 2004', [titles['demo-stille-nacht'], titles['demo-jesu'], titles['demo-sleigh']]),
			...program('Frühjahrskonzert 2012', [titles['demo-cancan'], titles['demo-morgenstimmung']]),
			...program(sommer, [titles['demo-nachtmusik'], titles['demo-007']]),
			// Each orchestra's own pieces name it: a row without an orchestra is played by both.
			...program(herbst, [titles['demo-egmont'], titles['demo-morgenstimmung'], titles['demo-007'], titles['demo-nachtmusik']], 'EO'),
			...program(herbst, [titles['demo-cancan'], titles['demo-sleigh']], 'A'),
			// The finale both play together.
			...program(herbst, [titles['demo-jesu']], 'EO, A'),
			...program(weihnacht, [titles['demo-sleigh'], titles['demo-stille-nacht']], 'EO'),
			{ concert: weihnacht, position: '1', piece: 'Abendlied', orchestra: 'KCH', composer: 'Josef Gabriel Rheinberger', publisher: 'Carus', duration: '3:10' },
			{ concert: weihnacht, position: '2', piece: 'Machet die Tore weit', orchestra: 'KCH', composer: 'Andreas Hammerschmidt', publisher: 'Bärenreiter', duration: '4:00' },
			...program(weihnacht, [titles['demo-jesu']], 'EO, KCH')
		]),
		tab('ensembles', [
			{ shortName: 'KCH', name: 'Kammerchor Musterstadt', kind: 'Chor', conductor: 'Clara Chorleiterin', website: 'https://example.org/kammerchor' }
		]),
		tab('rehearsals', [
			{ rehearsal: label(-10), piece: titles['demo-egmont'], eventId: 'demo-probe-1' },
			{ rehearsal: label(-10), piece: titles['demo-morgenstimmung'], eventId: 'demo-probe-1' },
			{ rehearsal: label(-3), piece: titles['demo-egmont'], notes: 'nur Durchführung', eventId: 'demo-probe-2' },
			{ rehearsal: label(-3), piece: titles['demo-007'], eventId: 'demo-probe-2' },
			{ rehearsal: label(4), piece: titles['demo-007'], eventId: 'demo-probe-3' },
			{ rehearsal: label(4), piece: titles['demo-nachtmusik'], eventId: 'demo-probe-3' }
		]),
		tab('members', [
			{ email: DEMO_ADMIN.email, name: DEMO_ADMIN.name, groups: 'Vorstand', orchestras: 'EO', status: 'aktiv' },
			{ email: DEMO_MEMBER.email, name: DEMO_MEMBER.name, instrument: 'Geige II', orchestras: 'EO', status: 'aktiv' },
			{ email: 'david@example.org', name: 'David Dirigent', groups: 'Dirigat (EO)', orchestras: 'EO', status: 'aktiv' },
			{ email: 'nora@example.org', name: 'Nora Notenwart', instrument: 'Viola', groups: 'Notenwart', orchestras: 'EO', status: 'aktiv' },
			{ email: DEMO_DESK_PARTNER.email, name: DEMO_DESK_PARTNER.name, instrument: 'Geige II', orchestras: 'EO', status: 'aktiv' },
			{ email: 'jonas@example.org', name: 'Jonas Geiger', instrument: 'Geige I', orchestras: 'EO', status: 'aktiv' },
			{ email: 'lea@example.org', name: 'Lea Lang', instrument: 'Geige I', orchestras: 'EO', status: 'aktiv' },
			{ email: 'paul@example.org', name: 'Paul Probe', instrument: 'Violoncello', orchestras: 'EO', status: 'aktiv' },
			{ email: 'ida@example.org', name: 'Ida Ibach', instrument: 'Flöte', orchestras: 'EO', status: 'aktiv' },
			{ email: 'tim@example.org', name: 'Tim Trompeter', instrument: 'Trompete', groups: 'Orga', orchestras: 'EO, A', status: 'aktiv' },
			{ email: 'karl@example.org', name: 'Karl Klarinette', instrument: 'Klarinette', orchestras: 'EO', status: 'pausiert', pausedUntil: at(90) },
			{ email: 'bea@example.org', name: 'Bea Bass', instrument: 'Kontrabass', orchestras: 'EO', status: 'aktiv' },
			{ email: 'sven@example.org', name: 'Sven Saxer', instrument: 'Alt-Saxophon', orchestras: 'EO', status: 'aktiv' },
			{ email: DEMO_PARENT.email, name: DEMO_PARENT.name, status: 'eltern', children: DEMO_MEMBER.email }
		]),
		tab(
			'groups',
			(config.roles ?? []).map((role) => ({ name: role.name, description: role.description }))
		),
		tab(
			'rights',
			(config.roles ?? []).flatMap((role) => role.rights.map((right) => ({ who: role.name, right })))
		),
		tab('requests', [{ email: 'neu@example.org', name: 'Nele Neu', requestedAt: at(-1) }]),
		tab('reports', [
			{
				piece: titles['demo-jesu'],
				pieceId: 'demo-jesu',
				part: 'Viola',
				fileId: 'demo-jesu-4',
				kind: t.feedbackValues.reportKind.pages,
				comment: 'Seite 2 fehlt.',
				status: t.feedbackValues.reportStatus.open,
				reportedBy: `${DEMO_MEMBER.name} <${DEMO_MEMBER.email}>`,
				reportedAt: at(-5),
				id: 'demo-report-1'
			},
			{
				// A better Hörbeispiel, ready for "Vorschlag übernehmen" on /meldungen; on the piece
				// without sheet music, which is keyed by its title.
				piece: 'Ungarischer Tanz Nr. 5',
				pieceId: 's-ungarischer-tanz-nr-5',
				kind: t.feedbackValues.reportKind.recording,
				comment: 'Hier gibt es eine gute Aufnahme.',
				link: 'https://example.org/ungarischer-tanz',
				status: t.feedbackValues.reportStatus.open,
				reportedBy: `${DEMO_MEMBER.name} <${DEMO_MEMBER.email}>`,
				reportedAt: at(-2),
				id: 'demo-report-2'
			}
		]),
		tab('wishes', [
			{
				kind: t.feedbackValues.wishKind.piece,
				title: 'Bolero',
				composer: 'Maurice Ravel',
				description: 'Wäre toll fürs nächste Sommerkonzert!',
				status: t.feedbackValues.wishStatus.open,
				submittedBy: `Jonas Geiger <jonas@example.org>`,
				submittedAt: at(-20),
				votes: 'lea@example.org, ida@example.org, mia@example.org',
				id: 'demo-wish-1'
			},
			{
				kind: t.feedbackValues.wishKind.feature,
				title: 'Metronom in der App',
				description: 'Zum Üben zu Hause.',
				status: t.feedbackValues.wishStatus.planned,
				answer: 'Schauen wir uns an.',
				submittedBy: `Paul Probe <paul@example.org>`,
				submittedAt: at(-30),
				id: 'demo-wish-2'
			}
		]),
		tab('missingParts', []),
		tab('signups', [
			...[
				['jonas@example.org', 'Jonas Geiger', 'yes'],
				['lea@example.org', 'Lea Lang', 'yes'],
				['paul@example.org', 'Paul Probe', 'maybe'],
				['ida@example.org', 'Ida Ibach', 'no'],
				['nora@example.org', 'Nora Notenwart', 'yes']
			].map(([who, name, answer]) => ({
				event: `Probe Herbstkonzert 🎶 · ${at(4)}`,
				who,
				name,
				answer: t.signups.answerValues[answer as 'yes' | 'maybe' | 'no'],
				comment: answer === 'maybe' ? 'Komme evtl. später' : '',
				answeredAt: at(-1),
				eventId: 'demo-probe-3'
			}))
		]),
		// Rented music: one due before the concert, one later, one back already.
		tab('loans', [
			{ piece: titles['demo-007'], from: 'Notenverleih Muster', borrowedAt: at(-40), dueAt: at(10), notes: 'Leihgebühr 60 €, Rücksendung per Post' },
			{ piece: titles['demo-egmont'], from: 'Stadtorchester Musterstadt', borrowedAt: at(-30), dueAt: at(45) },
			{ piece: titles['demo-sleigh'], from: 'Kreismusikschule', borrowedAt: at(-400), dueAt: at(-300), returned: 'TRUE' }
		]),
		// Agreed in rehearsal (#125): for the strings, for the coming concert, and an old one.
		tab('pieceNotes', [
			{ piece: titles['demo-egmont'], section: t.piece.groups.streicher, note: 'Takt 82–96: Bogen ab Saite, kurz und leicht.', by: 'David Dirigent', at: at(-10), id: 'demo-note-1' },
			{ piece: titles['demo-egmont'], concert: herbst, note: 'Ohne Wiederholung der Exposition, Sprung von Takt 117 nach 135.', by: 'David Dirigent', at: at(-3), id: 'demo-note-2' },
			{ piece: titles['demo-nachtmusik'], concert: sommer, note: 'Menuett ohne Wiederholungen.', by: 'David Dirigent', at: at(-70), id: 'demo-note-3' }
		]),
		// Parts played instead of one's own (#262): the saxophone on the bassoon part this autumn, Paul on the bass in one piece.
		tab('partAssignments', [
			{ who: 'Alt-Saxophon', part: 'Fagott', concert: herbst, by: 'David Dirigent', at: at(-5), id: 'demo-assign-1' },
			{ who: 'paul@example.org', part: 'Kontrabass', piece: titles['demo-007'], concert: herbst, by: 'Nora Notenwart', at: at(-2), id: 'demo-assign-2' }
		]),
		// What the last rehearsal did (#145), for those who missed it.
		tab('rehearsalNotes', [
			{
				rehearsal: label(-3),
				done: 'Egmont: Durchführung bis Takt 180. Themes from 007 einmal ganz durch.',
				practise: 'Egmont Takt 82–96 langsam, Streicher mit Bogen ab Saite.',
				next: 'Morgenstimmung und Eine kleine Nachtmusik, bitte pünktlich zum Stimmen.',
				by: 'David Dirigent',
				at: at(-3),
				eventId: 'demo-probe-2'
			}
		]),
		// Who came to the past rehearsals; Ida missed both.
		tab('attendance', [
			...[
				['jonas@example.org', 'Jonas Geiger', 'TRUE', 'TRUE'],
				['lea@example.org', 'Lea Lang', 'TRUE', 'FALSE'],
				['mia@example.org', DEMO_MEMBER.name, 'TRUE', 'TRUE'],
				['nora@example.org', 'Nora Notenwart', 'FALSE', 'TRUE'],
				['paul@example.org', 'Paul Probe', 'TRUE', 'TRUE'],
				['ida@example.org', 'Ida Ibach', 'FALSE', 'FALSE'],
				['tim@example.org', 'Tim Trompeter', 'TRUE', 'TRUE'],
				['bea@example.org', 'Bea Bass', 'TRUE', 'FALSE']
			].flatMap(([who, name, first, second]) => [
				{ event: label(-10), who, name, present: first, eventId: 'demo-probe-1' },
				{ event: label(-3), who, name, present: second, eventId: 'demo-probe-2' }
			])
		])
	]);
}
