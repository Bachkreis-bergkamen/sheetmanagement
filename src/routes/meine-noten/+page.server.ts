import { fail } from '@sveltejs/kit';
import { currentStatus, normalizeEmail, playsIn, type Member } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { eventDay, shortDateLabel } from '#lib/repertoire/dates.ts';
import { splitList } from '#lib/repertoire/lists.ts';
import { t } from '#lib/i18n/index.ts';
import {
	choicesFromForm,
	commonInstruments,
	formatInstrument,
	formatInstruments,
	matchParts,
	parseInstruments,
	playableInstruments,
	playedParts,
	playingAt,
	sectionsOf,
	type InstrumentChoice
} from '#lib/music/my-parts.ts';
import { partGlyph } from '#lib/music/instrument-glyph.ts';
import type { Part } from '#lib/music/types.ts';
import { partUrl } from '#lib/server/catalog.ts';
import { plannedInProgramOrder, programPositions } from '#lib/rehearsals/plan.ts';
import { getLibrary, isPastConcert, namedItem, orchestraOf, type Library, type LibraryConcert, type ProgramItem } from '#lib/server/library.ts';
import { pickConcerts, programFor, saidAt } from '#lib/server/my-concerts.ts';
import { getAccessList, getMusicConfig, getPartAssignments, getPieceNotes, getRehearsalPlan } from '#lib/server/repertoire.ts';
import { pickedAt } from '#lib/music/part-assignments.ts';
import { saveOwnPick } from '#lib/server/part-assignments.ts';
import { appliesTo, forConcert, notesOf } from '#lib/notes/piece-notes.ts';
import { readTab, refreshAfterWrite, SheetLayoutError, updateRecord } from '#lib/server/sheet-writes.ts';
import { saveSignup, signupsIfOn } from '#lib/server/signups.ts';
import { feedbackUser } from '#lib/server/feedback.ts';
import { normalize } from '#lib/repertoire/sheet.ts';
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
		concertId: concert?.id,
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
	const [library, access, music, pieceNotes, assignments, signups] = await Promise.all([
		getLibrary(),
		getAccessList(),
		getMusicConfig(),
		getPieceNotes(),
		getPartAssignments(),
		signupsIfOn()
	]);
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
	// The part given with the answer to a date ("Geige II" of "Geige I & II"): only that one there.
	const email = member?.email ?? locals.access.user?.email;
	const playing = (...eventIds: (string | undefined)[]) => playingAt(choices, saidAt(signups, email, eventIds));
	/**
	 * Picking the part played at a concert, for those with more than one: written into their
	 * answer, as on the concert's page. Only while sign-ups are on and they can answer.
	 */
	const sections = sectionsOf(choices);
	const answering = feedbackUser(locals);
	const pickPart = (concert: LibraryConcert) => {
		const event = library.schedule.ok ? library.schedule.byId.get(concert.id) : undefined;
		if (!signups || !email || !answering || sections.length < 2 || !event || event.past) return null;
		const answer = signups.byEvent.get(concert.id)?.find((signup) => signup.email === normalizeEmail(email));
		const said = answer ? parseInstruments(answer.instrument, config) : [];
		return {
			sections,
			current: said.length ? (sections.find((name) => normalize(name) === normalize(formatInstruments(said))) ?? formatInstruments(said)) : '',
			answered: !!answer
		};
	};
	/** Picking the part piece by piece (Geige I here, Geige II there): coming concerts in the sheet, for members with more than one. */
	const picksAt = (concert: LibraryConcert | undefined) => !!concert?.sheet && !!answering && sections.length > 1 && !isPastConcert(concert, library.today);
	const piecesOf = (items: ProgramItem[], concert: LibraryConcert | undefined, played: InstrumentChoice[], position = programPositions(items)) =>
		items.map((item) => {
			const piece = item.pieceId ? library.piecesById.get(item.pieceId) : undefined;
			const parts = piece?.detail ? playedParts(piece.detail, item.movements) : [];
			// The conductor's assignments first (#262), else the member's own pick for this piece.
			const { choices: chosen, locked } = pickedAt(
				{ email: member?.email, choices: played },
				assignments.assignments,
				{ piece: piece?.sheet?.title ?? item.title, concerts: concert?.sheet ? [concert.sheet.title, concert.sheet.ref] : [] },
				config
			);
			const picked = sectionsOf(chosen);
			return {
				pick:
					picksAt(concert) && piece?.sheet && !locked
						? { concert: concert!.id, current: picked.length === 1 && sections.includes(picked[0]) ? picked[0] : '' }
						: null,
				notes: notesFor(item, concert),
				position: position(item),
				title: item.title,
				subtitle: item.subtitle,
				pieceId: item.pieceId,
				hasMusic: parts.length > 0,
				recording: piece?.sheet?.recording,
				// One block per instrument the member plays, or per part assigned to them instead (#262).
				matches: chosen.map((choice) => {
					const match = parts.length ? matchParts(parts, choice, music) : { own: [], shared: [] };
					const show = (part: Part) => shown(part, locals.access.viaLink, viewer);
					return {
						label: formatInstrument(choice),
						// For reporting the part as missing (#306).
						instrument: choice.instrument,
						number: choice.numbers.length === 1 ? choice.numbers[0] : undefined,
						assigned: !!choice.assigned,
						own: match.own.map(show),
						shared: match.shared.map(show)
					};
				})
			};
		});

	return {
		choices,
		label: formatInstruments(choices),
		// Each of their parts on its own ("Geige I", "Geige II"), to pick per concert or piece.
		sections,
		unknown: !choices.length && text ? text : null,
		// Paused and inactive members still get their parts, with a hint.
		status: member ? currentStatus(member, library.today) : 'aktiv',
		pausedUntil: member?.pausedUntil,
		instruments: CHOICES,
		common: commonInstruments(config),
		concerts: [
			// A rehearsal asked for in the URL comes first, above the concerts.
			...(rehearsal ? [{ id: rehearsal.id, title: rehearsal.title, label: rehearsal.label, jump: rehearsal.jump, note: rehearsal.note, pieces: piecesOf(rehearsal.items, rehearsal.concert, playing(rehearsal.id, rehearsal.concertId), rehearsal.position), part: null }] : []),
			...concerts.map((concert) => ({
				id: concert.id,
				title: concert.title,
				label: concert.label?.long,
				// "Springen zu" is narrow on a phone: "Herbstkonzert · 19. Nov." (#223).
				jump: shortDateLabel(concert.dateKey, library.today, config.locale),
				note: undefined as string | undefined,
				pieces: piecesOf(programFor(concert, member), concert, playing(concert.id)),
				part: pickPart(concert)
			}))
		],
		focus: rehearsal?.id ?? focus?.id ?? null,
		// Merging fetches the PDFs through the app, which is for signed-in members only.
		canMerge: locals.auth === 'on' && locals.access.member
	};
};

export const actions: Actions = {
	/**
	 * The part played at one concert, of the member's own ("Geige II"), or all of them again:
	 * saved with their answer to it. Picking one without an answer yet is a Zusage.
	 */
	part: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('konzert') ?? '');
		const instrument = String(data.get('instrument') ?? '').trim();
		const user = feedbackUser(locals);
		if (!user) return fail(403, { partError: t.signups.signInNeeded, partConcert: id });
		const [library, access, signups] = await Promise.all([getLibrary(), getAccessList(), signupsIfOn()]);
		const event = library.schedule.ok ? library.schedule.byId.get(id) : undefined;
		if (!signups || !event || event.past || event.type !== 'konzert') return fail(404, { partError: t.signups.gone, partConcert: id });
		const member = access?.membersByEmail.get(normalizeEmail(user.email));
		const own = sectionsOf(parseInstruments(member?.instrument ?? '', config));
		if (instrument && !own.includes(instrument)) return fail(400, { partError: t.myParts.playing.failed, partConcert: id });
		const answer = signups.byEvent.get(id)?.find((signup) => signup.email === normalizeEmail(user.email));
		try {
			await saveSignup({ id: event.id, label: `${event.displayTitle} · ${event.date.long}` }, user, { answer: answer?.answer ?? 'yes', instrument });
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { partError: t.signups.notSetUp, partConcert: id });
			console.error('Saving the part for a concert failed:', cause);
			return fail(503, { partError: t.signups.failed, partConcert: id });
		}
		// For every piece now: the picks piece by piece there go.
		const concert = library.concertsById.get(id);
		if (concert?.sheet) await saveOwnPick(user.email, concert.sheet, undefined, '').catch((cause) => console.error('Clearing the part picks failed:', cause));
		return { partSaved: id };
	},

	/** The part played in one piece at a concert, of the member's own ("Geige I" here, "Geige II" there), or all of them. */
	piecePart: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('konzert') ?? '');
		const pieceId = String(data.get('stueck') ?? '');
		const instrument = String(data.get('instrument') ?? '').trim();
		const user = feedbackUser(locals);
		if (!user) return fail(403, { partError: t.signups.signInNeeded, partConcert: id });
		const [library, access] = await Promise.all([getLibrary(), getAccessList()]);
		const concert = library.concertsById.get(id);
		const piece = library.piecesById.get(pieceId);
		const member = access?.membersByEmail.get(normalizeEmail(user.email));
		if (!concert?.sheet || isPastConcert(concert, library.today) || !piece?.sheet || !programFor(concert, member).some((item) => item.pieceId === pieceId)) {
			return fail(404, { partError: t.messages.noPiece, partConcert: id });
		}
		const own = parseInstruments(member?.instrument ?? '', config);
		if (instrument && !sectionsOf(own).includes(instrument)) return fail(400, { partError: t.myParts.playing.failed, partConcert: id });
		try {
			// "Alle": every part of theirs, written out, so it holds over the concert's part.
			await saveOwnPick(user.email, concert.sheet, piece.sheet.title, instrument || formatInstruments(own));
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { partError: t.partAssignments.notSetUp, partConcert: id });
			console.error('Saving the part for a piece failed:', cause);
			return fail(503, { partError: t.partAssignments.failed, partConcert: id });
		}
		return { piecePartSaved: pieceId };
	},

	save: async ({ request, cookies, locals, url }) => {
		const choices = choicesFromForm(await request.formData(), CHOICES);
		if (!choices.length) return fail(400, { message: t.myParts.pickInstrument });
		const text = formatInstruments(choices, config);
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
