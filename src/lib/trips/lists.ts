import type { Participant, Trip, TripRole } from './trips.ts';

/**
 * The lists of a trip (#334, step 2): forms each participant fills in once per trip, filled in
 * again from their last trip and only confirmed. What's asked, who sees it, the kitchen's
 * counts, the insurer's list, and when the lists go.
 *
 * Instruments are the exception: they belong to the person, not to a trip. A member keeps
 * their instruments with value and insurance, and on each trip only ticks which ones come along.
 */

export const LIST_KINDS = ['instrumente', 'ernaehrung', 'wuensche', 'notfall', 'dokumente', 'einverstaendnis', 'fragen'] as const;
export type ListKind = (typeof LIST_KINDS)[number];

/** The lists a new trip asks for; travel documents only for trips abroad, the questions when there are some. */
export const DEFAULT_LISTS: ListKind[] = ['instrumente', 'ernaehrung', 'wuensche', 'notfall', 'einverstaendnis'];

/** The lists an organiser switches on or off; "fragen" is on when the trip has questions. */
export const CHOSEN_LISTS = LIST_KINDS.filter((kind) => kind !== 'fragen');

/**
 * Who reads a list besides the person: the organisation, or also the Betreuer·innen on the
 * trip, who need diet, emergency contacts and consents while they look after the group.
 */
export const LIST_READERS: Record<ListKind, 'organisers' | 'carers'> = {
	instrumente: 'organisers',
	ernaehrung: 'carers',
	wuensche: 'organisers',
	notfall: 'carers',
	dokumente: 'organisers',
	einverstaendnis: 'carers',
	fragen: 'organisers'
};

/** Kept for the next trip only when the person ticks it; health data (Art. 9 DSGVO) never by default. */
export const KEPT_BY_DEFAULT: Record<ListKind, boolean> = {
	instrumente: false,
	ernaehrung: false,
	wuensche: true,
	notfall: true,
	dokumente: false,
	einverstaendnis: true,
	fragen: false
};

/** Lists that can be carried to the next trip; documents expire and questions belong to one trip. */
export const KEEPABLE: ListKind[] = ['ernaehrung', 'wuensche', 'notfall', 'einverstaendnis'];

export const DIETS = ['alles', 'vegetarisch', 'vegan', 'pescetarisch', 'halal', 'koscher'] as const;
export type Diet = (typeof DIETS)[number];

export const SEVERITIES = ['leicht', 'mittel', 'schwer'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Whose the instrument is (#296): one's own, the orchestra's, or on loan from elsewhere. */
export const OWNERS = ['eigen', 'orchester', 'leihe'] as const;
export type Owner = (typeof OWNERS)[number];

/** Who insures it: one's own policy, the group's, or nobody. */
export const INSURANCES = ['eigene', 'gruppe', 'keine'] as const;
export type Insurance = (typeof INSURANCES)[number];

export const QUESTION_TYPES = ['text', 'janein', 'auswahl'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** An organiser's own question for one trip: "T-Shirt-Größe", "Bringst du einen Notenständer mit?". */
export interface Question {
	id: string;
	text: string;
	type: QuestionType;
	/** The choices of an "auswahl" question. */
	options: string[];
}

/** One of a member's instruments, kept across trips. */
export interface Instrument {
	id: string;
	email: string;
	/** "Violoncello", "Geige (Zweitinstrument)". */
	name: string;
	owner: Owner;
	/** In whole euros. */
	value?: number;
	insurance: Insurance;
	serial?: string;
	/** Needs a seat or its own room in the bus or plane: cello, double bass, percussion. */
	bulky: boolean;
	/** When its value was last confirmed, ISO. */
	confirmedAt?: string;
}

export interface Allergy {
	what: string;
	severity: Severity;
}

export interface ListAnswers {
	instrumente: { taken: string[] };
	ernaehrung: { diet: Diet; dietNote?: string; allergies: Allergy[]; medication?: string };
	wuensche: { roomWith?: string; busWith?: string; note?: string };
	notfall: { name: string; phone: string; insurance?: string };
	dokumente: { validId: boolean };
	einverstaendnis: { photos: boolean; travelAlone: boolean; freeTime?: boolean };
	fragen: Record<string, string>;
}

/** A list as filled in for a trip. */
export interface ListEntry<K extends ListKind = ListKind> {
	tripId: string;
	email: string;
	kind: K;
	data: ListAnswers[K];
	/** When it was saved or confirmed, ISO. */
	savedAt: string;
	/** Who saved it: the person, or a parent for a young player (#299). */
	savedBy: string;
}

/** A list kept for the next trip, when the person ticked "für die nächste Fahrt merken". */
export interface KeptList<K extends ListKind = ListKind> {
	email: string;
	kind: K;
	data: ListAnswers[K];
	savedAt: string;
}

/** How long the lists stay after the trip; the plan, the trip and the sign-ups stay. */
export const LISTS_KEEP_DAYS = 28;

export const NAME_MAX = 120;
export const TEXT_MAX = 500;
export const QUESTIONS_MAX = 20;
export const ALLERGIES_MAX = 20;
export const INSTRUMENTS_MAX = 20;
export const VALUE_MAX = 10_000_000;

const text = (form: FormData, name: string) =>
	String(form.get(name) ?? '')
		.trim()
		.replace(/[ \t]+/g, ' ');
const checked = (form: FormData, name: string) => ['on', 'true', '1', 'ja'].includes(String(form.get(name) ?? ''));
/** Only what's there: { note: 'x' } or {}, so empty fields don't end up stored. */
const some = <K extends string>(key: K, value: string) => (value ? ({ [key]: value } as Record<K, string>) : {});

/** The lists a trip asks for, in their order; its own questions when it has some. */
export function tripLists(trip: Pick<Trip, 'lists' | 'questions'>): ListKind[] {
	return LIST_KINDS.filter((kind) => (kind === 'fragen' ? trip.questions.length > 0 : trip.lists.includes(kind)));
}

/** The lists one person fills in: everyone the same, except that only those who play or conduct bring instruments. */
export function listsFor(trip: Pick<Trip, 'lists' | 'questions'>, roles: TripRole[]): ListKind[] {
	return tripLists(trip).filter((kind) => kind !== 'instrumente' || roles.includes('musiker') || roles.includes('dirigent'));
}

/** Whether someone reads a list of the trip: organisers all, Betreuer·innen on the trip those they need. */
export function canReadList(kind: ListKind, { organises, carer }: { organises: boolean; carer: boolean }): boolean {
	return organises || (carer && LIST_READERS[kind] === 'carers');
}

/** A Betreuer·in with a place on the trip. */
export const isCarer = (participants: Participant[], email: string) => participants.some((p) => p.email === email && p.status === 'angemeldet' && p.roles.includes('betreuer'));

/** Instruments that need their own seat or room, going by the name, as the form's first guess. */
export const looksBulky = (name: string) => /cello|kontrabass|\bbass\b|pauke|schlagzeug|percussion|schlagwerk|marimba|vibraphon|harfe|tuba|kontrafagott|tenorhorn|euphonium|xylophon/i.test(name);

export type ListProblem = 'diet' | 'severity' | 'consent' | 'emergency' | 'phone' | 'answer' | 'choice' | 'instrument' | 'value' | 'too-long' | 'too-many' | 'parent';

/**
 * A list from its form. Every list says on the form who sees it; the diet and allergies need
 * the explicit consent of Art. 9 DSGVO, ticked each trip.
 */
export function listFromForm<K extends ListKind>(
	kind: K,
	form: FormData,
	{ questions = [], minor = false, instruments = [] }: { questions?: Question[]; minor?: boolean; instruments?: Pick<Instrument, 'id'>[] } = {}
): { data: ListAnswers[K] } | { problem: ListProblem } {
	const tooLong = (...values: string[]) => values.some((value) => value.length > TEXT_MAX);
	const result = (data: ListAnswers[ListKind]) => ({ data: data as ListAnswers[K] });
	switch (kind) {
		case 'instrumente': {
			const known = new Set(instruments.map((instrument) => instrument.id));
			return result({ taken: [...new Set(form.getAll('taken').map(String))].filter((id) => known.has(id)) });
		}
		case 'ernaehrung': {
			const diet = text(form, 'diet') as Diet;
			if (!DIETS.includes(diet)) return { problem: 'diet' };
			if (!checked(form, 'consent')) return { problem: 'consent' };
			const whats = form.getAll('allergy').map((value) => String(value).trim());
			const severities = form.getAll('severity').map(String);
			const allergies: Allergy[] = [];
			for (const [i, what] of whats.entries()) {
				if (!what) continue;
				const severity = (severities[i] || 'mittel') as Severity;
				if (!SEVERITIES.includes(severity)) return { problem: 'severity' };
				if (what.length > NAME_MAX) return { problem: 'too-long' };
				allergies.push({ what, severity });
			}
			if (allergies.length > ALLERGIES_MAX) return { problem: 'too-many' };
			const dietNote = text(form, 'dietNote');
			const medication = String(form.get('medication') ?? '').trim();
			if (tooLong(dietNote, medication)) return { problem: 'too-long' };
			return result({ diet, allergies, ...some('dietNote', dietNote), ...some('medication', medication) });
		}
		case 'wuensche': {
			const roomWith = text(form, 'roomWith');
			const busWith = text(form, 'busWith');
			const note = String(form.get('note') ?? '').trim();
			if (tooLong(roomWith, busWith, note)) return { problem: 'too-long' };
			return result({ ...some('roomWith', roomWith), ...some('busWith', busWith), ...some('note', note) });
		}
		case 'notfall': {
			const name = text(form, 'name');
			const phone = text(form, 'phone');
			const insurance = text(form, 'insurance');
			if (!name || !phone) return { problem: 'emergency' };
			if (!/^[+\d][\d ()/\-.]{4,30}$/.test(phone)) return { problem: 'phone' };
			if (name.length > NAME_MAX || insurance.length > NAME_MAX) return { problem: 'too-long' };
			return result({ name, phone, ...some('insurance', insurance) });
		}
		case 'dokumente':
			return result({ validId: text(form, 'validId') === 'ja' });
		case 'einverstaendnis':
			return result({ photos: text(form, 'photos') === 'ja', travelAlone: text(form, 'travelAlone') === 'ja', ...(minor ? { freeTime: text(form, 'freeTime') === 'ja' } : {}) });
		case 'fragen': {
			const answers: Record<string, string> = {};
			for (const question of questions) {
				const answer = text(form, `q-${question.id}`);
				if (!answer) continue;
				if (answer.length > TEXT_MAX) return { problem: 'too-long' };
				if (question.type === 'janein' && answer !== 'ja' && answer !== 'nein') return { problem: 'answer' };
				if (question.type === 'auswahl' && !question.options.includes(answer)) return { problem: 'choice' };
				answers[question.id] = answer;
			}
			return result(answers);
		}
	}
	return { problem: 'answer' };
}

/** One instrument from its form; the id is kept when one is edited. */
export function instrumentFromForm(form: FormData): { instrument: Omit<Instrument, 'id' | 'email' | 'confirmedAt'> } | { problem: ListProblem } {
	const name = text(form, 'name');
	const owner = (text(form, 'owner') || 'eigen') as Owner;
	const insurance = (text(form, 'insurance') || 'keine') as Insurance;
	const valueText = text(form, 'value').replace(/[.\s]/g, '').replace(/,\d*$/, '').replace(/€/g, '');
	const serial = text(form, 'serial');
	if (!name) return { problem: 'instrument' };
	if (!OWNERS.includes(owner) || !INSURANCES.includes(insurance)) return { problem: 'instrument' };
	if (name.length > NAME_MAX || serial.length > NAME_MAX) return { problem: 'too-long' };
	let value: number | undefined;
	if (valueText) {
		value = Number(valueText);
		if (!Number.isInteger(value) || value < 0 || value > VALUE_MAX) return { problem: 'value' };
	}
	return { instrument: { name, owner, insurance, bulky: checked(form, 'bulky'), ...(value !== undefined ? { value } : {}), ...some('serial', serial) } };
}

/**
 * The trip's own questions from the trip's form: rows of text, kind and choices (comma
 * separated). A row keeps its id when edited, so answers given before still belong to it.
 */
export function questionsFromForm(form: FormData, newId: () => string): Question[] | null {
	const ids = form.getAll('questionId').map(String);
	const texts = form.getAll('questionText').map((value) => String(value).trim());
	const types = form.getAll('questionType').map(String);
	const options = form.getAll('questionOptions').map(String);
	const questions: Question[] = [];
	for (const [i, questionText] of texts.entries()) {
		if (!questionText) continue;
		const type = (QUESTION_TYPES as readonly string[]).includes(types[i]) ? (types[i] as QuestionType) : 'text';
		const choices = type === 'auswahl' ? [...new Set((options[i] ?? '').split(/[,;]/).map((option) => option.trim()).filter(Boolean))] : [];
		if (questionText.length > TEXT_MAX || choices.some((choice) => choice.length > NAME_MAX)) return null;
		// A choice question without choices is a text question.
		questions.push({ id: ids[i]?.trim() || newId(), text: questionText, type: type === 'auswahl' && !choices.length ? 'text' : type, options: choices });
	}
	return questions.length > QUESTIONS_MAX ? null : questions;
}

/** The lists ticked on the trip's form, in their order. */
export function chosenLists(form: FormData): ListKind[] {
	const ticked = new Set(form.getAll('list').map(String));
	return CHOSEN_LISTS.filter((kind) => ticked.has(kind));
}

/** Whether a list can be carried to the next trip. */
export const isKeepable = (kind: ListKind) => KEEPABLE.includes(kind);

export interface ListProgress {
	kind: ListKind;
	/** How many of those who should have filled it in. */
	filled: number;
	of: number;
	/** The names of those still missing. */
	missing: string[];
}

/**
 * The organisers' overview: for each list of the trip, who has filled it in among those with a
 * place. A young player's consents count only once a parent saved them (#299).
 */
export function listProgress(trip: Pick<Trip, 'lists' | 'questions'>, participants: Participant[], entries: ListEntry[], minors: Set<string>): ListProgress[] {
	const going = participants.filter((p) => p.status === 'angemeldet');
	return tripLists(trip).map((kind) => {
		const due = going.filter((p) => listsFor(trip, p.roles).includes(kind));
		const done = (p: Participant) => entries.some((entry) => entry.email === p.email && entry.kind === kind && (kind !== 'einverstaendnis' || !minors.has(p.email) || entry.savedBy !== p.email));
		const missing = due.filter((p) => !done(p));
		return { kind, filled: due.length - missing.length, of: due.length, missing: missing.map((p) => p.name) };
	});
}

export interface Kitchen {
	/** Everyone with a place; those whose list is missing count as unknown. */
	people: number;
	diets: { diet: Diet | 'unbekannt'; count: number }[];
	/** Allergies and intolerances by what and how bad, without names. */
	allergies: { what: string; severity: Severity; count: number }[];
	/** Names only where the kitchen needs them: severe allergies, and diet notes. */
	named: { name: string; diet: Diet; allergies: Allergy[]; dietNote?: string }[];
}

const SEVERITY_RANK: Record<Severity, number> = { schwer: 0, mittel: 1, leicht: 2 };

/** What the kitchen or hostel needs: counts and needs without names, names only where it must. */
export function kitchen(participants: Participant[], entries: ListEntry[]): Kitchen {
	const going = participants.filter((p) => p.status === 'angemeldet');
	const lists = new Map(entries.filter((entry): entry is ListEntry<'ernaehrung'> => entry.kind === 'ernaehrung').map((entry) => [entry.email, entry.data]));
	const diets = new Map<Diet | 'unbekannt', number>();
	const allergies = new Map<string, { what: string; severity: Severity; count: number }>();
	const named: Kitchen['named'] = [];
	for (const person of going) {
		const data = lists.get(person.email);
		const diet = data?.diet ?? 'unbekannt';
		diets.set(diet, (diets.get(diet) ?? 0) + 1);
		if (!data) continue;
		for (const allergy of data.allergies) {
			// "Nüsse" and "nüsse " are the same for the kitchen.
			const key = `${allergy.what.toLowerCase().trim()}|${allergy.severity}`;
			const known = allergies.get(key);
			if (known) known.count++;
			else allergies.set(key, { what: allergy.what.trim(), severity: allergy.severity, count: 1 });
		}
		if (data.allergies.some((allergy) => allergy.severity === 'schwer') || data.dietNote) named.push({ name: person.name, diet: data.diet, allergies: data.allergies, ...(data.dietNote ? { dietNote: data.dietNote } : {}) });
	}
	return {
		people: going.length,
		diets: [...DIETS, 'unbekannt' as const].filter((diet) => diets.has(diet)).map((diet) => ({ diet, count: diets.get(diet)! })),
		allergies: [...allergies.values()].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count || a.what.localeCompare(b.what)),
		named: named.sort((a, b) => a.name.localeCompare(b.name))
	};
}

export interface InstrumentRow {
	person: string;
	instrument: Instrument;
}

/** The instruments coming along, for the insurer and customs: who takes what, with the total value. */
export function instrumentsOnTrip(participants: Participant[], entries: ListEntry[], instruments: Instrument[]): { rows: InstrumentRow[]; total: number; bulky: InstrumentRow[] } {
	const going = new Map(participants.filter((p) => p.status === 'angemeldet').map((p) => [p.email, p.name]));
	const byId = new Map(instruments.map((instrument) => [instrument.id, instrument]));
	const rows = entries
		.filter((entry): entry is ListEntry<'instrumente'> => entry.kind === 'instrumente' && going.has(entry.email))
		.flatMap((entry) => entry.data.taken.flatMap((id) => (byId.get(id)?.email === entry.email ? [{ person: going.get(entry.email)!, instrument: byId.get(id)! }] : [])))
		.sort((a, b) => a.person.localeCompare(b.person) || a.instrument.name.localeCompare(b.instrument.name));
	return { rows, total: rows.reduce((sum, row) => sum + (row.instrument.value ?? 0), 0), bulky: rows.filter((row) => row.instrument.bulky) };
}

/** The day before which ended trips lose their lists. */
export function listsCutoff(today: string, keepDays = LISTS_KEEP_DAYS): string {
	return new Date(Date.parse(`${today}T12:00:00Z`) - keepDays * 86_400_000).toISOString().slice(0, 10);
}

/** The trips whose lists are due to go: ended more than the keeping time ago. */
export const listsDue = <T extends Pick<Trip, 'lastDay'>>(trips: T[], today: string, keepDays = LISTS_KEEP_DAYS) => trips.filter((trip) => trip.lastDay < listsCutoff(today, keepDays));

/** The day a trip's lists go, to say so on the forms. */
export const listsGoneOn = (trip: Pick<Trip, 'lastDay'>, keepDays = LISTS_KEEP_DAYS) => new Date(Date.parse(`${trip.lastDay}T12:00:00Z`) + (keepDays + 1) * 86_400_000).toISOString().slice(0, 10);
