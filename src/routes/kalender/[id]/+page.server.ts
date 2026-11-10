import { error, fail } from '@sveltejs/kit';
import { countingMembers, isAdminOnly, mayFor, normalizeEmail } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { coverage, formatInstrument, parseInstruments, playableInstruments, playedParts, programInstruments } from '#lib/music/my-parts.ts';
import { missingVoices, readInstrumentation } from '#lib/music/instrumentation.ts';
import { t } from '#lib/i18n/index.ts';
import { ANSWERS, coverage as signupCoverage, groupSections, totals, type Answer, type SectionCoverage } from '#lib/signups/signups.ts';
import { feedbackUser, formText } from '#lib/server/feedback.ts';
import { features, isOn } from '#lib/server/env.ts';
import { today } from '#lib/server/members.ts';
import { saveSignup, withdrawSignup } from '#lib/server/signups.ts';
import { currentProgramAvailable, currentProgramStatus, isCurrentConcert, NoProgramFolderError, syncCurrentProgram } from '#lib/server/current-program.ts';
import { getLibrary, isPastConcert, namedItem, orchestraOf, programsOf, reportPieces, type Library, type LibraryConcert, type ProgramItem } from '#lib/server/library.ts';
import { pickOrchestra, programLabel, programScopes, sameOrchestra } from '#lib/repertoire/orchestras.ts';
import { onlyGuests, performerNames } from '#lib/repertoire/ensembles.ts';
import { reportScopeOf } from '#lib/server/report-scope.ts';
import { orchestra as deployment } from '#lib/server/env.ts';
import { joinList, splitList } from '#lib/repertoire/lists.ts';
import { eventFormValues, newEventFromForm, orchestraTitle, ORCHESTRA_PROPERTY } from '#lib/events/new-event.ts';
import { calendarWriteEnabled } from '#lib/server/services.ts';
import { calendarRange, changeCalendarEvent, setEventOrchestras } from '#lib/server/schedule.ts';
import { eventDay } from '#lib/repertoire/dates.ts';
import { getAccessList, getAttendance, getFeedback, getLoans, getMusicConfig, getRehearsalNotes, getRehearsalPlan, getSignups } from '#lib/server/repertoire.ts';
import { checkRehearsalNote, isEmptyNote, type RehearsalNote } from '#lib/notes/rehearsal-notes.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { publicDetails, publishedIds, readDetails, setPublicDetails, setPublished } from '#lib/server/public-concerts.ts';
import { appendRecords, deleteRows, ensureTab, readTab, refreshAfterWrite, SheetLayoutError, updateRecord, withSheetLock } from '#lib/server/sheet-writes.ts';
import { formatDay } from '#lib/events/format.ts';
import { concertCheck } from '#lib/repertoire/concert-check.ts';
import { reportGaps } from '#lib/repertoire/music-report.ts';
import { loansOf } from '#lib/loans/loans.ts';
import { attendanceSummary } from '#lib/attendance/attendance.ts';
import type { RehearsalPlan } from '#lib/rehearsals/plan.ts';
import { normalize } from '#lib/repertoire/sheet.ts';
import type { ShownEvent } from '#lib/events/schedule.ts';
import type { Actions, PageServerLoad } from './$types';

/** Calendar descriptions may contain simple HTML; the page shows plain text. */
function plainText(html: string | undefined): string | undefined {
	if (!html) return undefined;
	let text = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n');
	// Repeated, so nested leftovers like "<scr<b>ipt>" don't survive as a tag.
	for (let previous = ''; previous !== text; ) {
		previous = text;
		text = text.replace(/<[^<>]*>/g, '');
	}
	text = text
		// One pass, so "&amp;lt;" stays "&lt;" instead of becoming "<".
		.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (_, name: keyof typeof ENTITIES) => ENTITIES[name])
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return text || undefined;
}

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

/**
 * Pieces × instruments for the programme, so missing parts are found before the first
 * rehearsal. Columns: every instrument with a part in the programme, plus the ones
 * members play (from "Mitglieder"), which the page can filter down to. Only active members
 * of the concert's orchestra count.
 */
async function instrumentation(items: ProgramItem[], library: Library, orchestra: string | undefined) {
	const rows = items.map((item) => {
		const piece = item.pieceId ? library.piecesById.get(item.pieceId) : undefined;
		return { item, parts: piece?.detail ? playedParts(piece.detail) : [] };
	});
	const withMusic = rows.filter((row) => row.parts.length);
	if (!withMusic.length) return null;

	const [access, music] = await Promise.all([getAccessList(), getMusicConfig()]);
	const played = new Set(
		countingMembers(access?.members ?? [], orchestra, library.today).flatMap((member) => parseInstruments(member.instrument ?? '', config).map((choice) => choice.instrument))
	);
	const needed = new Set(programInstruments(withMusic.map((row) => row.parts), music));
	const instruments = config.instruments
		.filter((instrument) => needed.has(instrument.name) || (played.has(instrument.name) && instrument.family !== 'partitur'))
		.map((instrument) => instrument.name);
	return {
		instruments: instruments.map((name) => ({ name, played: played.has(name) })),
		rows: rows.map(({ item, parts }) => ({
			title: item.title,
			pieceId: item.pieceId,
			hasMusic: parts.length > 0,
			cells: instruments.map((name) => (parts.length ? coverage(parts, name, music) : ('none' as const)))
		}))
	};
}

/**
 * Sign-ups for an upcoming calendar event: the member's own answer, and the coverage per
 * section. Everyone sees the counts; names and comments need "anmeldungen.sehen".
 */
async function signups(event: ShownEvent, orchestra: string | undefined, locals: App.Locals) {
	if (event.past || !isOn('signups')) return null;
	const user = feedbackUser(locals);
	if (!user) return locals.auth === 'on' ? { state: 'sign-in' as const } : null;
	const [list, access] = await Promise.all([getSignups(), getAccessList()]);
	if (!list) return { state: 'not-set-up' as const };
	const answers = list.byEvent.get(event.id) ?? [];
	const email = normalizeEmail(user.email);
	const mine = answers.find((signup) => signup.email === email);
	const member = access?.membersByEmail.get(email);
	const own = parseInstruments(member?.instrument ?? '', config);
	// The member's sections one by one ("Geige I", "Geige II", "Viola") to pick from.
	const ownSections = own.flatMap((choice) =>
		choice.numbers.length ? choice.numbers.map((n) => formatInstrument({ instrument: choice.instrument, numbers: [n] })) : [formatInstrument(choice)]
	);
	const sections = signupCoverage(answers, access?.members ?? [], config, { orchestra, today: today() });
	const seeAll = locals.access.rights.has('anmeldungen.sehen');
	const shown = (list: SectionCoverage[]) =>
		list.map(({ label, yes, maybe, no, open }) => ({
			label,
			counts: { yes: yes.length, maybe: maybe.length, no: no.length, open: open.length },
			names: seeAll ? { yes, maybe, no, open } : null
		}));
	// Each instrument as one line, the violins by part; part by part for whoever wants it.
	const grouped = groupSections(sections, config.splitSections);
	return {
		state: 'ready' as const,
		mine: mine ? { answer: mine.answer, instrument: mine.instrument, comment: mine.comment } : null,
		ownInstrument: own[0] ? formatInstrument({ instrument: own[0].instrument, numbers: own[0].numbers.slice(0, 1) }) : '',
		ownSections,
		instruments: playableInstruments(config),
		totals: totals(sections),
		seeAll,
		sections: shown(grouped),
		byPart: grouped.length < sections.length ? shown(sections) : null,
		comments: seeAll
			? answers.filter((signup) => signup.comment).map((signup) => ({ name: access?.membersByEmail.get(signup.email)?.name ?? signup.name, comment: signup.comment }))
			: []
	};
}

/**
 * Attendance (#120). A rehearsal that has begun: how many came, for those who take it.
 * A concert: per member, how many of its rehearsals they came to, overall and per piece,
 * for those who take attendance; members see only their own count.
 */
async function attendance(event: ShownEvent, library: Library, plan: RehearsalPlan | null, locals: App.Locals) {
	if (!isOn('attendance')) return null;
	const canTake = locals.access.rights.has('anwesenheit.erfassen');
	const user = feedbackUser(locals);
	const isRehearsal = event.type === 'probe' || event.type === 'generalprobe';
	if (isRehearsal) {
		if (!canTake || event.daysUntil > 0) return null;
		const taken = await getAttendance();
		if (!taken) return { kind: 'rehearsal' as const, state: 'not-set-up' as const };
		const entries = [...(taken.byEvent.get(event.id)?.values() ?? [])];
		return {
			kind: 'rehearsal' as const,
			state: 'ready' as const,
			present: entries.filter((entry) => entry.present).length,
			of: entries.length,
			url: `/kalender/${encodeURIComponent(event.id)}/anwesenheit`
		};
	}
	if (event.type !== 'konzert' || !user) return null;
	const [taken, access] = await Promise.all([getAttendance(), canTake ? getAccessList() : null]);
	if (!taken) return null;
	const email = normalizeEmail(user.email);
	const planned = (id: string) => (plan?.byEvent.get(id) ?? []).map((entry) => normalize(entry.pieceName));
	const concert = library.concertsById.get(event.id);
	const orchestra = concert?.orchestra;
	// Ticked present at least once; unticked rows of the conductor or the board don't count.
	const recorded = new Set(
		event.rehearsalIds.flatMap((id) => [...(taken.byEvent.get(id)?.values() ?? [])].filter((entry) => entry.present).map((entry) => entry.email))
	);
	// Players: active members with an instrument; anyone else once they were ticked present.
	const people = canTake
		? [
				...new Set([
					...countingMembers(access?.members ?? [], orchestra, library.today)
						.filter((member) => member.instrument)
						.map((member) => member.email),
					...[...recorded].filter((email) => !isAdminOnly(access?.membersByEmail.get(email)))
				])
			]
		: [email];
	const summary = attendanceSummary(taken, event.rehearsalIds, people, planned);
	if (!summary.taken) return null;
	// Own count for anyone with a row: a player who missed every rehearsal sees that too.
	const hasRow = event.rehearsalIds.some((id) => taken.byEvent.get(id)?.has(email));
	const mine = hasRow ? summary.members.find((member) => member.email === email) : undefined;
	if (!canTake) return { kind: 'concert' as const, taken: summary.taken, mine: mine && { present: mine.present, of: mine.of }, table: null };
	// Columns: the programme's pieces that were planned at a rehearsal with attendance taken.
	const program = concert?.sheet?.program ?? [];
	const columns = program
		.map((entry, i) => ({ key: normalize(entry.pieceName), title: concert?.program[i]?.title ?? entry.pieceName }))
		.filter((column) => summary.members.some((member) => member.pieces.get(column.key)?.of));
	const names = new Map([...(access?.members ?? [])].map((member) => [member.email, member.name]));
	for (const id of event.rehearsalIds) for (const entry of taken.byEvent.get(id)?.values() ?? []) if (!names.has(entry.email)) names.set(entry.email, entry.name);
	const rows = summary.members
		.map((member) => ({
			name: names.get(member.email) ?? member.email,
			present: member.present,
			of: member.of,
			pieces: columns.map((column) => member.pieces.get(column.key) ?? null)
		}))
		// Who missed most first: that's what the conductor looks for before the concert.
		.sort((a, b) => a.present / (a.of || 1) - b.present / (b.of || 1) || a.name.localeCompare(b.name, config.locale));
	return {
		kind: 'concert' as const,
		taken: summary.taken,
		mine: mine && { present: mine.present, of: mine.of },
		table: { columns: columns.map((column) => column.title), rows }
	};
}

/** After the concert, the check stays this long: for the music list and returning rented music. */
const CHECK_AFTER_DAYS = 60;

/** The planners' "Konzert-Check" (#117–#119 together); null when it doesn't apply. */
async function check(concert: LibraryConcert | undefined, event: ShownEvent | undefined, library: Library, plan: RehearsalPlan | null) {
	if (!concert?.sheet) return null;
	const past = isPastConcert(concert, library.today);
	if (past && (!event || event.daysUntil < -CHECK_AFTER_DAYS)) return null;
	const on = features();
	const loans = on.loans ? ((await getLoans())?.loans ?? []) : [];
	// What guests play isn't ours to rehearse or borrow.
	const names = concert.sheet.program.filter((entry) => !onlyGuests(entry.orchestra, concert.partners)).map((entry) => entry.pieceName);
	const rehearsalIds = event?.rehearsalIds ?? [];
	const planned = new Set(rehearsalIds.flatMap((id) => (plan?.byEvent.get(id) ?? []).map((entry) => normalize(entry.pieceName))));
	const gaps = new Set(reportGaps(reportPieces(library, concert, await reportScopeOf(concert))).map((gap) => gap.title));
	// A piece whose Besetzung names an instrument without a part counts as one with gaps (#249).
	const music = await getMusicConfig();
	const unscored = (pieceId: string | undefined) => {
		const piece = pieceId ? library.piecesById.get(pieceId) : undefined;
		return !!piece?.detail?.parts.length && missingVoices(readInstrumentation(piece.sheet?.instrumentation, music), playedParts(piece.detail), music).length > 0;
	};
	const id = encodeURIComponent(concert.id);
	const items = concertCheck({
		past,
		program: concert.program
			.filter((item) => !onlyGuests(item.orchestra, concert.partners))
			.map((item) => ({
				title: item.title,
				status: item.status === 'ok' && unscored(item.pieceId) ? 'missing' : item.status,
				duration: item.duration,
				inReport: !gaps.has(item.title)
			})),
		rehearsals: rehearsalIds.length,
		unplanned: [...new Set(names.map(normalize))].filter((name) => !planned.has(name)).length,
		loans: [...new Set(names)].flatMap((name) =>
			loansOf(loans, name).map((loan) => ({
				title: namedItem(library, loan.pieceName).title,
				dueBeforeConcert: !!loan.dueAt && loan.dueAt < concert.dateKey
			}))
		),
		urls: {
			program: `/kalender/${id}/programm`,
			plan: rehearsalIds.length ? `/kalender/${id}/probenplan` : undefined,
			report: on.musicReport ? `/kalender/${id}/drucken?art=musikfolge` : undefined,
			loans: '/leihmaterial',
			gaps: '/fehlende-stimmen'
		}
	});
	return items.length ? items : null;
}

async function openWishes(concertTitle: string) {
	if (!isOn('wishes')) return 0;
	const wishes = (await getFeedback())?.wishes ?? [];
	return wishes.filter(
		(wish) => wish.kind === 'piece' && wish.status === 'open' && (!wish.concert || normalize(wish.concert) === normalize(concertTitle))
	).length;
}

const isRehearsal = (event: ShownEvent) => event.type === 'probe' || event.type === 'generalprobe';
/** A rehearsal can get its note once it has begun. */
const hasBegun = (event: ShownEvent) => event.past || event.daysUntil <= 0;

const shownNote = (note: RehearsalNote) => ({
	done: note.done,
	practise: note.practise,
	next: note.next,
	by: note.by,
	at: /^\d{4}-\d{2}-\d{2}$/.test(note.at) ? formatDay(note.at, config.locale) : note.at
});

/**
 * What a rehearsal did and what comes next (#145): its own note once it has begun; before
 * it, the note of the rehearsal before, so members know what to practise for it.
 */
async function rehearsalNote(event: ShownEvent, events: ShownEvent[], locals: App.Locals) {
	if (!isRehearsal(event)) return null;
	const notes = (await getRehearsalNotes()).byEvent;
	const own = notes.get(event.id);
	const canWrite = locals.access.rights.has('programme.bearbeiten') && hasBegun(event);
	const rehearsals = events.filter(isRehearsal);
	const before = !own && !hasBegun(event) ? rehearsals[rehearsals.findIndex((e) => e.id === event.id) - 1] : undefined;
	const previous = before && notes.get(before.id);
	if (!own && !previous && !canWrite) return null;
	return {
		note: own ? shownNote(own) : null,
		canWrite,
		previous: before && previous ? { id: before.id, date: before.date.long, note: shownNote(previous) } : null
	};
}

const mapUrl = (location: string | undefined) =>
	location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : undefined;

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const library = await getLibrary();
	const schedule = library.schedule;
	const event = schedule.ok ? schedule.byId.get(params.id) : undefined;
	// Concerts from the sheet: from the orchestra's history, or no longer in the calendar.
	const concert = library.concertsById.get(params.id);

	if (!event && !concert) {
		if (!schedule.ok) error(503, t.messages.calendarUnavailable);
		error(404, t.messages.noEvent);
	}

	const items = concert?.program ?? [];
	const partners = concert?.partners ?? [];
	const scopes = concert ? programScopes(concert.orchestras, partners.map((partner) => partner.shortName)) : [];
	const several = scopes.length > 1;
	const editUrl = (orchestra: string | undefined) =>
		`/kalender/${encodeURIComponent(params.id)}/programm${orchestra && several ? `?orchester=${encodeURIComponent(orchestra)}` : ''}`;
	// For several orchestras: the editor's tab for pieces they play together.
	const together = several ? scopes.at(-1) : undefined;
	// "01 | Aktuelles Programm" in Drive (#60), for upcoming concerts once Drive may be written to.
	const showDrive = locals.access.rights.has('programme.bearbeiten') && !!concert && currentProgramAvailable() && !isPastConcert(concert, library.today);
	const program = {
		items,
		// One per orchestra that plays the concert, each with its own programme and Drive folder;
		// what they play together after, its pieces in each of their folders.
		groups: (concert ? programsOf(concert) : [{ orchestra: undefined, joint: false, items }]).map((group) => ({
			orchestra: group.orchestra ?? '',
			// Guests by their full name: "Programm Kammerchor Unna", "Gemeinsam: EO + Kammerchor Unna".
			label: group.orchestra ? programLabel(group.orchestra, (short) => performerNames(short, partners)[0] ?? short) : '',
			joint: group.joint,
			items: group.items,
			editUrl: editUrl(group.orchestra),
			// Guests have no Drive folder here.
			drive: showDrive && !group.joint && !onlyGuests(group.orchestra, partners)
				? {
						...currentProgramStatus(concert!, library, group.orchestra),
						orchestra: group.orchestra ?? concert!.title,
						next: isCurrentConcert(concert!, library, group.orchestra)
					}
				: null
		})),
		canEdit: locals.access.rights.has('programme.bearbeiten') && !!concert?.sheet,
		// The full set of parts to print (#195), for whoever looks after the music.
		canPrintSet: locals.access.rights.has('stuecke.bearbeiten'),
		// Where to add pieces the orchestras play together, while there are none yet.
		jointUrl: together && !concert!.program.some((item) => sameOrchestra(item.orchestra, together)) ? editUrl(together) : undefined,
		jointLabel: together ?? '',
		jointNames: together ? performerNames(together, partners) : [],
		// For whoever plans programmes; it reads every piece's parts.
		instrumentation:
			locals.access.rights.has('programme.bearbeiten') && items.length
				? await instrumentation(
						items.filter((item) => !onlyGuests(item.orchestra, partners)),
						library,
						concert?.orchestra
					)
				: null,
		saved: url.searchParams.has('gespeichert'),
		sheet: library.sheet,
		sharedFrom: concert?.sharedFrom,
		sharedWith: concert?.sharedWith ?? [],
		// For planners: open piece wishes for this concert or any time, shown in the editor.
		suggestions: locals.access.rights.has('programme.bearbeiten') && concert?.sheet ? await openWishes(concert.sheet.title) : 0,
		check: locals.access.rights.has('programme.bearbeiten') ? await check(concert, event, library, await getRehearsalPlan()) : null,
		// How the Drive sync after saving in the editor went.
		driveAuto: showDrive ? url.searchParams.get('drive') : null,
		// On the orchestra's website (#197): whether this concert is in the public feed; null for those who can't change it.
		published: concert && locals.access.rights.has('programme.bearbeiten') ? (await publishedIds()).has(concert.id) : null,
		// What the website shows with it: texts, where to get tickets.
		publicDetails: concert && locals.access.rights.has('programme.bearbeiten') ? ((await publicDetails()).get(concert.id) ?? {}) : null,
		// Who plays it: our orchestras ("Orchester"), those we give it with ("Mitwirkende"), and who organises it when it isn't us.
		ours: concert?.orchestras ?? [],
		partners: partners.map(({ name, kind, conductor, website }) => ({ name, kind, conductor, website })),
		organizer: concert?.organizer?.name,
		// For planners: the form to change both, from the "Ensembles" tab and free names.
		partnerForm:
			concert?.sheet && locals.access.rights.has('programme.bearbeiten')
				? {
						// Our own orchestras, written to "Orchester" like the sheet's dropdown does.
						orchestras: config.orchestras,
						ours: concert.orchestras,
						ensembles: library.ensembles.map(({ shortName, name }) => ({ shortName, name })),
						chosen: partners.filter((partner) => library.ensembles.some((e) => e.shortName === partner.shortName)).map((partner) => partner.shortName),
						others: joinList(partners.filter((partner) => !library.ensembles.some((e) => e.shortName === partner.shortName)).map((partner) => partner.name)),
						organizer: concert.organizer?.shortName ?? '',
						us: deployment().name
					}
				: null
	};

	if (!event) {
		const { title, label, dateText, location, orchestra } = concert!;
		return { kind: 'archive' as const, archive: { title, label, dateText, location, orchestra }, mapUrl: mapUrl(location), program };
	}

	const lookup = (id: string) => (schedule.ok ? schedule.byId.get(id) : undefined);
	// A rehearsal is for the orchestras its title names, else those of the concert it prepares for.
	const orchestra = orchestraOf(library, event);
	// The rehearsal plan (#65): what's rehearsed when, edited per concert.
	const plan = await getRehearsalPlan();
	const planned = (id: string) => (plan?.byEvent.get(id) ?? []).map((entry) => namedItem(library, entry.pieceName, entry.notes));
	const planConcert = event.type === 'konzert' ? event : event.concertId ? lookup(event.concertId) : undefined;
	const canPlan = locals.access.rights.has('programme.bearbeiten') && !!planConcert?.rehearsalIds.length;
	// The "Planung" view (concerts only): for those who plan the programme or take attendance.
	const rights = locals.access.rights;
	const on = features();
	const lastRehearsal = event.rehearsalIds
		.map(lookup)
		.filter((e): e is ShownEvent => !!e && e.daysUntil <= 0)
		.at(-1);
	const takesAttendance = on.attendance && rights.has('anwesenheit.erfassen');
	const planning =
		event.type === 'konzert' && (rights.has('programme.bearbeiten') || takesAttendance)
			? {
					printUrl: items.length ? `/kalender/${encodeURIComponent(event.id)}/drucken` : undefined,
					reportUrl:
						items.length && rights.has('programme.bearbeiten') && on.musicReport
							? `/kalender/${encodeURIComponent(event.id)}/drucken?art=musikfolge`
							: undefined,
					attendanceUrl:
						lastRehearsal && takesAttendance
							? { href: `/kalender/${encodeURIComponent(lastRehearsal.id)}/anwesenheit`, label: lastRehearsal.date.long }
							: undefined
				}
			: null;
	return {
		kind: 'event' as const,
		planning,
		signups: await signups(event, orchestra, locals),
		attendance: await attendance(event, library, plan, locals),
		attendanceSaved: url.searchParams.has('anwesenheit'),
		// Concert tickets (docs/tickets-plan.md): the sale's setup and the door, for those who run them.
		tickets:
			event.type === 'konzert' && on.tickets
				? {
						manageUrl: rights.has('karten.verwalten') ? `/kalender/${encodeURIComponent(event.id)}/karten` : undefined,
						doorUrl: rights.has('karten.einlass') && !event.past ? `/einlass/${encodeURIComponent(event.id)}` : undefined
					}
				: null,
		// Planners add a rehearsal for an upcoming concert from its page: the form on /kalender, filled in.
		addRehearsalUrl:
			event.type === 'konzert' && !event.past && rights.has('termine.planen') ? `/kalender?neu=probe&konzert=${encodeURIComponent(event.id)}#termin` : undefined,
		rehearsalNote: await rehearsalNote(event, schedule.ok ? schedule.events : [], locals),
		event: { ...event, description: plainText(event.description) },
		rehearsals: event.rehearsalIds
			.map(lookup)
			.filter((e): e is ShownEvent => !!e)
			.map((rehearsal) => ({ ...rehearsal, planned: planned(rehearsal.id).map(({ title, pieceId }) => ({ title, pieceId })) })),
		rehearsalPlan: {
			items: event.type === 'konzert' ? [] : planned(event.id),
			editUrl: canPlan ? `/kalender/${encodeURIComponent(planConcert!.id)}/probenplan` : undefined,
			// The member's parts for this rehearsal (#115): planned pieces, else the whole programme.
			partsUrl:
				event.type !== 'konzert' && !event.past && (planned(event.id).length || library.concertsById.get(planConcert?.id ?? '')?.program.length)
					? `/meine-noten?probe=${encodeURIComponent(event.id)}`
					: undefined
		},
		concert: event.concertId ? lookup(event.concertId) : undefined,
		// Whose rehearsal it is, changed here by those who plan dates (several orchestras only).
		orchestras:
			event.type !== 'konzert' && config.orchestras.length > 1
				? {
						current: orchestra ? config.orchestras.filter((name) => splitList(orchestra).some((other) => sameOrchestra(name, other))) : config.orchestras,
						all: config.orchestras,
						canChange: rights.has('termine.planen') && calendarWriteEnabled()
					}
				: null,
		// Those who plan dates change it here: title, time, place, note; it's changed in the Google Calendar.
		editing:
			rights.has('termine.planen') && event.type !== 'sonstiges'
				? {
						writable: calendarWriteEnabled(),
						last: shownLast(),
						orchestras: config.orchestras,
						concerts: editConcerts(schedule.ok ? schedule.events : [], event).map((concert) => ({
							id: concert.id,
							title: concert.displayTitle,
							date: concert.date.long
						})),
						values: {
							...eventFormValues({ ...event, description: plainText(event.description) }, { timeZone: config.timeZone, orchestras: config.orchestras }),
							orchestra: orchestra ?? ''
						}
					}
				: null,
		mapUrl: mapUrl(event.location),
		program
	};
};

/** The last day the site shows from the calendar: a date beyond would never show. */
function shownLast() {
	return eventDay({ start: calendarRange(Date.now()).to.toISOString(), allDay: false }, config.timeZone);
}

/** Concerts a rehearsal may be moved to: the upcoming ones, and the one it belongs to now. */
function editConcerts(events: ShownEvent[], event: ShownEvent) {
	if (event.type === 'konzert') return [];
	return events.filter((other) => other.type === 'konzert' && (!other.past || other.id === event.concertId));
}

/** The upcoming calendar event a sign-up is for, with a readable label for the sheet. */
async function upcoming(id: string) {
	const library = await getLibrary();
	const event = library.schedule.ok ? library.schedule.byId.get(id) : undefined;
	return event && !event.past ? { id: event.id, label: `${event.displayTitle} · ${event.date.long}` } : null;
}

/** Runs one sign-up write; a missing tab or a failed write becomes a message. */
async function signupChange(locals: App.Locals, id: string, work: (event: { id: string; label: string }, user: NonNullable<ReturnType<typeof feedbackUser>>) => Promise<void>) {
	const user = feedbackUser(locals);
	if (!isOn('signups')) return fail(404, { signupError: t.signups.gone });
	if (!user) return fail(403, { signupError: t.signups.signInNeeded });
	const event = await upcoming(id);
	if (!event) return fail(404, { signupError: t.signups.gone });
	try {
		await work(event, user);
		return { signupSaved: true };
	} catch (cause) {
		if (cause instanceof SheetLayoutError) return fail(409, { signupError: t.signups.notSetUp });
		console.error('Saving a sign-up failed:', cause);
		return fail(503, { signupError: t.signups.failed });
	}
}

export const actions: Actions = {
	/** One click: Zusage, Vielleicht or Absage; instrument and comment stay as they were. */
	answer: async ({ request, locals, params }) => {
		const data = await request.formData();
		const answer = formText(data, 'answer') as Answer;
		if (!ANSWERS.includes(answer)) return fail(400, { signupError: t.signups.failed });
		const details = data.has('comment')
			? {
					instrument: parseInstruments(formText(data, 'instrument'), config).length ? formText(data, 'instrument') : '',
					comment: formText(data, 'comment', 500)
				}
			: {};
		return signupChange(locals, params.id, (event, user) => saveSignup(event, user, { answer, ...details }));
	},

	/** In or out of the public feed for the orchestra's website (#197), upcoming or for the Chronik. */
	publish: async ({ request, locals, params }) => {
		requireRight(locals, 'programme.bearbeiten');
		const concert = (await getLibrary()).concertsById.get(params.id);
		if (!concert) error(404, t.messages.noEvent);
		const published = (await request.formData()).get('published') === 'on';
		await setPublished(concert.id, published);
		return { publishSaved: published };
	},

	/** The text and ticket details the website shows with a published concert (#197). */
	publicDetails: async ({ request, locals, params }) => {
		requireRight(locals, 'programme.bearbeiten');
		const concert = (await getLibrary()).concertsById.get(params.id);
		if (!concert) error(404, t.messages.noEvent);
		const { details, badLink } = readDetails(await request.formData());
		if (badLink) return fail(400, { publicDetailsError: t.concert.publish.badLink });
		await setPublicDetails(concert.id, details);
		return { publicDetailsSaved: true };
	},

	/** Who we give the concert with ("Mitwirkende") and who organises it ("Veranstalter"), in "Konzerte". */
	partners: async ({ request, locals, params }) => {
		requireRight(locals, 'programme.bearbeiten');
		const concert = (await getLibrary()).concertsById.get(params.id);
		if (!concert?.sheet) error(404, t.messages.noEvent);
		const data = await request.formData();
		const chosen = data.getAll('partner').map(String);
		const partners = joinList(splitList([...chosen, formText(data, 'others')].join(', ')).slice(0, 20));
		const organizer = formText(data, 'organizer').slice(0, 200);
		// Our orchestras only when the form offered them; in the configured order, "EO, A".
		const ticked = new Set(data.getAll('orchestra').map(String));
		const own = data.has('ours') ? { orchestra: joinList(config.orchestras.filter((name) => ticked.has(name))) } : {};
		try {
			const concerts = await readTab('concerts');
			const row = concerts.rows.find((r) => normalize(r.values.title) === normalize(concert.sheet!.title));
			if (!row) return fail(409, { partnersError: t.editor.notInSheet });
			await updateRecord('concerts', concerts, row.row, { ...own, partners, organizer });
			await refreshAfterWrite();
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { partnersError: t.partners.needsSetup });
			console.error('Saving guest ensembles failed:', cause);
			return fail(503, { partnersError: t.messages.sheetFailed });
		}
		return { partnersSaved: true };
	},

	withdraw: ({ locals, params }) => signupChange(locals, params.id, (event, user) => withdrawSignup(event.id, user)),

	/**
	 * Changes a concert or rehearsal in the Google Calendar ("termine.planen", CALENDAR_WRITE): the
	 * same form as adding one on /kalender, filled in. Also for dates already past.
	 */
	editEvent: async ({ request, locals, params }) => {
		requireRight(locals, 'termine.planen');
		const form = await request.formData();
		const values = Object.fromEntries([...form].map(([name, value]) => [name, String(value)]));
		values.orchestra = form.getAll('orchestra').map(String).join(', ');
		// Also not moved to another orchestra by a role limited to some (#305).
		const own = locals.access.scopes?.get('termine.planen');
		if (own && !mayFor(locals.access, 'termine.planen', values.orchestra)) {
			return fail(403, { eventError: t.calendar.add.otherOrchestra(own.join(', ')), eventValues: values });
		}
		if (!calendarWriteEnabled()) return fail(503, { eventError: t.calendar.add.readOnly, eventValues: values });
		const library = await getLibrary();
		const schedule = library.schedule;
		const event = schedule.ok ? schedule.byId.get(params.id) : undefined;
		if (!schedule.ok || !event || event.type === 'sonstiges') error(404, t.messages.noEvent);
		// A concert stays a concert, a rehearsal a rehearsal: what hangs on it (programme, plan, sign-ups) stays right.
		const type = String(form.get('type') ?? '');
		if ((event.type === 'konzert') !== (type === 'konzert')) return fail(400, { eventError: t.calendar.add.problems.type, eventValues: values });
		const concerts = editConcerts(schedule.events, event);
		const parsed = newEventFromForm(form, {
			keywords: config.events,
			timeZone: config.timeZone,
			concerts,
			orchestras: config.orchestras,
			range: { first: '', last: shownLast() },
			editing: { concertId: event.concertId }
		});
		if ('error' in parsed) return fail(400, { eventError: t.calendar.add.problems[parsed.error], eventValues: values });
		const { extendedProperties, location, description, ...rest } = parsed.event;
		// The note as the calendar keeps it (it may be HTML) stays unless it was changed here.
		const note = description ?? '';
		const result = await changeCalendarEvent(event.id, {
			...rest,
			location: location ?? '',
			...(note !== (plainText(event.description) ?? '') ? { description: note } : {}),
			// All of the orchestras, or a concert: nothing kept on the event.
			extendedProperties: { shared: { [ORCHESTRA_PROPERTY]: extendedProperties?.shared[ORCHESTRA_PROPERTY] ?? null } }
		});
		if (!result.ok) return fail(result.reason === 'failed' ? 503 : 400, { eventError: t.calendar.add.errors[result.reason], eventValues: values });
		return { eventSaved: true };
	},

	/** Which orchestras a rehearsal is for, ticked one by one; also for rehearsals already past. */
	orchestras: async ({ request, locals, params }) => {
		requireRight(locals, 'termine.planen');
		const library = await getLibrary();
		const event = library.schedule.ok ? library.schedule.byId.get(params.id) : undefined;
		if (!event || event.type === 'konzert') error(404, t.messages.noEvent);
		const ticked = new Set((await request.formData()).getAll('orchestra').map(String));
		const chosen = config.orchestras.filter((name) => ticked.has(name));
		if (!chosen.length) return fail(400, { orchestraError: t.concert.orchestras.none });
		const own = locals.access.scopes?.get('termine.planen');
		if (own && !mayFor(locals.access, 'termine.planen', chosen.join(', '))) return fail(403, { orchestraError: t.calendar.add.otherOrchestra(own.join(', ')) });
		const result = await setEventOrchestras(event.id, {
			summary: orchestraTitle(event.title, chosen, config.orchestras),
			orchestras: chosen.join(', ')
		});
		if (!result.ok) return fail(result.reason === 'failed' ? 503 : 400, { orchestraError: t.calendar.add.errors[result.reason] });
		return { orchestrasSaved: true };
	},

	/** Puts the programme's pieces into "01 | Aktuelles Programm" and takes the others out (#60). */
	currentProgram: async ({ request, locals, params }) => {
		requireRight(locals, 'programme.bearbeiten');
		if (!currentProgramAvailable()) error(404, t.messages.noEvent);
		const library = await getLibrary();
		const concert = library.concertsById.get(params.id);
		if (!concert) error(404, t.messages.noEvent);
		// Which orchestra's programme, for a concert several play; the card shows the answer.
		const orchestra = pickOrchestra(concert.orchestras, formText(await request.formData(), 'orchestra'));
		const currentProgramOrchestra = orchestra ?? '';
		try {
			return { currentProgram: await syncCurrentProgram(concert, library, orchestra), currentProgramOrchestra };
		} catch (cause) {
			if (cause instanceof NoProgramFolderError) return fail(409, { currentProgramError: t.currentProgram[cause.reason], currentProgramOrchestra });
			console.error('Syncing the current programme failed:', cause);
			return fail(503, { currentProgramError: t.currentProgram.failed, currentProgramOrchestra });
		}
	},

	/** Saves the rehearsal's note (#145); all fields empty removes it. One row per rehearsal. */
	rehearsalNote: async ({ request, locals, params }) => {
		requireRight(locals, 'programme.bearbeiten');
		const library = await getLibrary();
		const event = library.schedule.ok ? library.schedule.byId.get(params.id) : undefined;
		if (!event || !isRehearsal(event) || !hasBegun(event)) return fail(404, { rehearsalNoteError: t.rehearsalNotes.gone });
		const data = await request.formData();
		const input = { done: formText(data, 'done', 2000), practise: formText(data, 'practise', 2000), next: formText(data, 'next', 2000) };
		const values = checkRehearsalNote(input);
		if (!values) return fail(400, { rehearsalNoteError: t.rehearsalNotes.tooLong, rehearsalNoteValues: input });
		try {
			await ensureTab('rehearsalNotes');
			const signed = { ...values, by: locals.access.user?.name ?? '', at: today() };
			// Read and write in one turn (#156): two saves at once each find the other's row.
			await withSheetLock(async () => {
				const table = await readTab('rehearsalNotes');
				const rows = table.rows.filter((row) => row.values.eventId === event.id);
				if (isEmptyNote(values)) {
					await deleteRows('rehearsalNotes', table, rows.map((row) => row.row));
				} else if (rows.length) {
					// The last row is the one shown; extra rows entered by hand go.
					await updateRecord('rehearsalNotes', table, rows.at(-1)!.row, signed);
					await deleteRows('rehearsalNotes', table, rows.slice(0, -1).map((row) => row.row));
				} else {
					await appendRecords('rehearsalNotes', table, [{ rehearsal: `${event.displayTitle} · ${event.date.long}`, ...signed, eventId: event.id }]);
				}
			});
			await refreshAfterWrite();
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { rehearsalNoteError: t.rehearsalNotes.notSetUp, rehearsalNoteValues: input });
			console.error('Saving a rehearsal note failed:', cause);
			return fail(503, { rehearsalNoteError: t.rehearsalNotes.failed, rehearsalNoteValues: input });
		}
		return { rehearsalNoteSaved: true };
	}
};
