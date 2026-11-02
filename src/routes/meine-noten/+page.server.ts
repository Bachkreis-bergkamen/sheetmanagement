import { fail } from '@sveltejs/kit';
import { currentStatus, normalizeEmail, playsIn, type Member } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { eventDay, shortDateLabel } from '#lib/repertoire/dates.ts';
import { splitList } from '#lib/repertoire/lists.ts';
import { t } from '#lib/i18n/index.ts';
import { choicesFromForm, commonInstruments, formatInstrument, formatInstruments, matchParts, parseInstruments, playableInstruments, playedParts } from '#lib/music/my-parts.ts';
import { partGlyph } from '#lib/music/instrument-glyph.ts';
import type { Part } from '#lib/music/types.ts';
import { partUrl } from '#lib/server/catalog.ts';
import { plannedInProgramOrder, programPositions } from '#lib/rehearsals/plan.ts';
import { getLibrary, isPastConcert, namedItem, orchestraOf, type Library, type LibraryConcert, type ProgramItem } from '#lib/server/library.ts';
import { getAccessList, getMusicConfig, getPartAssignments, getPieceNotes, getRehearsalPlan } from '#lib/server/repertoire.ts';
import { choicesAt } from '#lib/music/part-assignments.ts';
import { appliesTo, forConcert, notesOf } from '#lib/notes/piece-notes.ts';
import { readTab, refreshAfterWrite, updateRecord } from '#lib/server/sheet-writes.ts';
import type { Actions, PageServerLoad } from './$types';

/** Remembers the instrument in the browser too: for people not in "Mitglieder" and while sign-in is off. */
const COOKIE = 'instrument';
const YEAR = 365 * 24 * 60 * 60;

/** Instruments to pick from: real instruments, not shared parts or numbered voices. */
const CHOICES = playableInstruments(config);

const PDF = 'application/pdf';
/** For signed-in members, PDFs open in the app's practice viewer (/ueben); Drive stays a link from there. */
const shown = (part: Part, viaLink?: boolean, viewer = false) => ({
	id: part.id,
	label: part.label,
	notes: part.notes,
	status: part.status,
	url: viewer && part.mimeType === PDF ? `/ueben/${encodeURIComponent(part.id)}` : partUrl(part.id, part.mimeType, viaLink),
	pdf: part.mimeType === PDF,
	glyph: partGlyph(part)
});

/** What the member plays of a concert: with several orchestras, only their own orchestras' programmes. */
function programFor(concert: LibraryConcert | undefined, member: Member | undefined): ProgramItem[] {
	const program = concert?.program ?? [];
	return member && (concert?.orchestras.length ?? 0) > 1 ? program.filter((item) => playsIn(member, item.orchestra)) : program;
}

/**
 * The concerts to show, one below the other: every upcoming one of the member's orchestras,
 * soonest first, and one asked for in the URL on top. `focus` is where the page starts: the
 * one asked for, else the next one with a programme.
 */
function pickConcerts(concerts: LibraryConcert[], today: string, wanted: string | null, member: Member | undefined) {
	const upcoming = concerts
		.filter((concert) => !isPastConcert(concert, today) && (!member || playsIn(member, concert.orchestra)))
		.reverse();
	const asked = wanted ? concerts.find((c) => c.id === wanted) : undefined;
	const shown = asked && !upcoming.includes(asked) ? [asked, ...upcoming] : upcoming;
	const focus = asked ?? upcoming.find((c) => programFor(c, member).length) ?? upcoming[0];
	return { shown, focus };
}

/**
 * One rehearsal asked for in the URL (#115): the pieces planned for it, in the programme's
 * order, else the whole programme of the concert it prepares for, with a note saying so.
 */
async function rehearsalOf(library: Library, id: string | null, member: Member | undefined) {
	const event = id && library.schedule.ok ? library.schedule.byId.get(id) : undefined;
	if (!event || (event.type !== 'probe' && event.type !== 'generalprobe')) return null;
	const concert = event.concertId ? library.concertsById.get(event.concertId) : undefined;
	// A rehearsal of one orchestra ("Probe A") rehearses its programme and what it plays together with others.
	const own = concert && concert.orchestras.length > 1 ? orchestraOf(library, event) : undefined;
	const program = programFor(concert, member).filter((item) => !own || playsIn({ orchestras: splitList(own) }, item.orchestra));
	const planned = ((await getRehearsalPlan())?.byEvent.get(event.id) ?? []).map((entry) => namedItem(library, entry.pieceName, entry.notes));
	return {
		id: event.id,
		title: event.displayTitle,
		label: [event.date.long, event.date.time].filter(Boolean).join(' · '),
		jump: shortDateLabel(eventDay(event, config.timeZone), library.today, config.locale),
		concert,
		items: planned.length ? plannedInProgramOrder(program, planned) : program,
		// Numbered as in the concert, so "3" is the third piece the member plays there.
		position: programPositions(programFor(concert, member)),
		note: planned.length ? undefined : program.length ? t.myParts.wholeProgram : undefined
	};
}

export const load: PageServerLoad = async ({ url, cookies, locals }) => {
	const [library, access, music, pieceNotes, assignments] = await Promise.all([getLibrary(), getAccessList(), getMusicConfig(), getPieceNotes(), getPartAssignments()]);
	const member = locals.access.user ? access?.membersByEmail.get(normalizeEmail(locals.access.user.email)) : undefined;
	const rehearsal = await rehearsalOf(library, url.searchParams.get('probe'), member);
	const viewer = locals.auth === 'on' && !!member;

	// What to show: asked for in the URL, else from "Mitglieder" (it follows members to every
	// device and the profile page edits it), else remembered in this browser.
	const text = url.searchParams.get('instrument') ?? member?.instrument ?? cookies.get(COOKIE) ?? '';
	const choices = parseInstruments(text, config);

	const { shown: concerts, focus } = pickConcerts(library.concerts, library.today, url.searchParams.get('konzert'), member);
	// Notes from rehearsals (#125) for the member's instruments and this concert, newest first.
	const instruments = choices.map((choice) => choice.instrument);
	const notesFor = (item: ProgramItem, concert: LibraryConcert | undefined) => {
		const name = (item.pieceId ? library.piecesById.get(item.pieceId)?.sheet?.title : undefined) ?? item.title;
		const concertTitle = concert?.sheet?.title ?? concert?.title;
		return notesOf(pieceNotes.notes, name)
			.filter((note) => forConcert(note, concertTitle) && appliesTo(note, instruments, config))
			.map((note) => ({ text: note.text, section: note.section }));
	};
	const piecesOf = (items: ProgramItem[], concert: LibraryConcert | undefined, position = programPositions(items)) =>
		items.map((item) => {
			const piece = item.pieceId ? library.piecesById.get(item.pieceId) : undefined;
			const parts = piece?.detail ? playedParts(piece.detail) : [];
			return {
				notes: notesFor(item, concert),
				position: position(item),
				title: item.title,
				subtitle: item.subtitle,
				pieceId: item.pieceId,
				hasMusic: parts.length > 0,
				recording: piece?.sheet?.recording,
				// One block per instrument the member plays, or per part assigned to them instead (#262).
				matches: choicesAt(
					{ email: member?.email, choices },
					assignments.assignments,
					{ piece: piece?.sheet?.title ?? item.title, concerts: concert?.sheet ? [concert.sheet.title] : [] },
					config
				).map((choice) => {
					const match = parts.length ? matchParts(parts, choice, music) : { own: [], shared: [] };
					const show = (part: Part) => shown(part, locals.access.viaLink, viewer);
					return { label: formatInstrument(choice), assigned: !!choice.assigned, own: match.own.map(show), shared: match.shared.map(show) };
				})
			};
		});

	return {
		choices,
		label: formatInstruments(choices),
		unknown: !choices.length && text ? text : null,
		// Paused and inactive members still get their parts, with a hint.
		status: member ? currentStatus(member, library.today) : 'aktiv',
		pausedUntil: member?.pausedUntil,
		instruments: CHOICES,
		common: commonInstruments(config),
		concerts: [
			// A rehearsal asked for in the URL comes first, above the concerts.
			...(rehearsal ? [{ id: rehearsal.id, title: rehearsal.title, label: rehearsal.label, jump: rehearsal.jump, note: rehearsal.note, pieces: piecesOf(rehearsal.items, rehearsal.concert, rehearsal.position) }] : []),
			...concerts.map((concert) => ({
				id: concert.id,
				title: concert.title,
				label: concert.label?.long,
				// "Springen zu" is narrow on a phone: "Herbstkonzert · 19. Nov." (#223).
				jump: shortDateLabel(concert.dateKey, library.today, config.locale),
				note: undefined as string | undefined,
				pieces: piecesOf(programFor(concert, member), concert)
			}))
		],
		focus: rehearsal?.id ?? focus?.id ?? null,
		// Merging fetches the PDFs through the app, which is for signed-in members only.
		canMerge: locals.auth === 'on' && locals.access.member
	};
};

export const actions: Actions = {
	save: async ({ request, cookies, locals, url }) => {
		const choices = choicesFromForm(await request.formData(), CHOICES);
		if (!choices.length) return fail(400, { message: t.myParts.pickInstrument });
		const text = formatInstruments(choices);
		cookies.set(COOKIE, text, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: YEAR, secure: url.protocol === 'https:' });

		// Members listed in "Mitglieder" get it saved there too, so it follows them to other devices.
		const user = locals.auth === 'on' && locals.access.member ? locals.access.user : null;
		if (user) {
			try {
				const members = await readTab('members');
				const row = members.rows.find((r) => normalizeEmail(r.values.email) === normalizeEmail(user.email));
				if (row && row.values.instrument !== text) {
					await updateRecord('members', members, row.row, { instrument: text });
					await refreshAfterWrite();
				}
			} catch (error) {
				// The cookie still works; the sheet can be fixed by hand.
				console.error('Saving the instrument in Mitglieder failed:', error);
			}
		}
		return { saved: true };
	}
};
