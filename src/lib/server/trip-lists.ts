import { error } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { isCarer, kitchen, instrumentsOnTrip, canReadList, tripLists, type Instrument, type ListAnswers, type ListEntry, type ListKind, type Question } from '#lib/trips/lists.ts';
import { config } from '#lib/config/index.ts';
import { isActive, localDay, type Participant } from '#lib/trips/trips.ts';
import { childrenIn, openTrip } from './trips.ts';

/**
 * The lists of a trip on the server (#334, step 2): whose lists someone fills in (their own, or
 * as a parent their child's), who reads them, and the exports for the insurer, kitchen and
 * Betreuer·innen.
 */

export type OpenedTrip = Awaited<ReturnType<typeof openTrip>>;

export interface ListPerson {
	email: string;
	name: string;
	participant: Participant;
	/** A young player (#299): the consents are the parents' to give. */
	minor: boolean;
	/** A parent fills in their child's lists. */
	byParent: boolean;
}

/**
 * Whose lists are open: the viewer's own when they come along, or with "fuer" (1, 2, …) one of
 * their children who does. Null when it's neither.
 */
export function listPerson(opened: OpenedTrip, fuer: string | null): ListPerson | null {
	const { viewer, participants, list } = opened;
	const minors = childrenIn(list);
	const children = viewer.children.map((email) => participants.find((p) => p.email === email && isActive(p))).filter((p): p is Participant => !!p);
	if (fuer) {
		const child = children[Number(fuer) - 1];
		return child ? { email: child.email, name: child.name, participant: child, minor: true, byParent: true } : null;
	}
	const own = participants.find((p) => p.email === viewer.email && isActive(p));
	return own ? { email: own.email, name: own.name, participant: own, minor: minors.has(own.email), byParent: false } : null;
}

/** Who reads the trip's lists at all: the organisers and the Betreuer·innen on it; a 404 for the others. */
export function listReader(opened: OpenedTrip) {
	const carer = isCarer(opened.participants, opened.viewer.email);
	if (!opened.organises && !carer) error(404, t.trips.noAccess);
	const access = { organises: opened.organises, carer };
	return { ...access, readable: tripLists(opened.trip).filter((kind) => canReadList(kind, access)) };
}

/** A form's label as a column heading: "Krankenversicherung (optional)" → "Krankenversicherung". */
const short = (label: string) => label.replace(/ \(optional\)$/, '');

const yes = (value: boolean | undefined) => (value === undefined ? '' : value ? t.trips.lists.yes : t.trips.lists.no);

/** One list as rows for a file: a header, then a row per participant who filled it in. */
export function listRows(kind: ListKind, participants: Participant[], entries: ListEntry[], options: { questions?: Question[]; instruments?: Instrument[] } = {}): string[][] {
	const [head, ...rows] = rowsOf(kind, participants, entries, options);
	return head ? [head.map(short), ...rows] : [];
}

function rowsOf(kind: ListKind, participants: Participant[], entries: ListEntry[], { questions = [], instruments = [] }: { questions?: Question[]; instruments?: Instrument[] } = {}): string[][] {
	const going = participants.filter((p) => p.status === 'angemeldet');
	const of = <K extends ListKind>(p: Participant) => entries.find((entry) => entry.email === p.email && entry.kind === kind) as ListEntry<K> | undefined;
	const h = t.trips.lists.columns;
	switch (kind) {
		case 'instrumente': {
			const { rows, total } = instrumentsOnTrip(participants, entries, instruments);
			const f = t.trips.lists.instruments;
			return [
				[h.name, f.name, f.owner, f.value, f.insurance, f.serial, f.bulky, f.confirmedAt],
				...rows.map(({ person, instrument }) => [
					person,
					instrument.name,
					f.owners[instrument.owner],
					instrument.value === undefined ? '' : String(instrument.value),
					f.insurances[instrument.insurance],
					instrument.serial ?? '',
					yes(instrument.bulky),
					instrument.confirmedAt ? localDay(instrument.confirmedAt, config.timeZone) : ''
				]),
				[f.total, '', '', String(total), '', '', '', '']
			];
		}
		case 'ernaehrung': {
			const f = t.trips.lists.diet;
			return [
				[h.name, f.diet, f.dietNote, f.allergies, f.medication],
				...going.flatMap((p) => {
					const data = of<'ernaehrung'>(p)?.data;
					return data ? [[p.name, f.diets[data.diet], data.dietNote ?? '', data.allergies.map((a) => `${a.what} (${f.severities[a.severity]})`).join(', '), data.medication ?? '']] : [];
				})
			];
		}
		case 'wuensche': {
			const f = t.trips.lists.wishes;
			return [[h.name, f.roomWith, f.busWith, f.note], ...going.flatMap((p) => ((data) => (data ? [[p.name, data.roomWith ?? '', data.busWith ?? '', data.note ?? '']] : []))(of<'wuensche'>(p)?.data))];
		}
		case 'notfall': {
			const f = t.trips.lists.emergency;
			return [[h.name, f.name, f.phone, f.insurance], ...going.flatMap((p) => ((data) => (data ? [[p.name, data.name, data.phone, data.insurance ?? '']] : []))(of<'notfall'>(p)?.data))];
		}
		case 'dokumente':
			return [[h.name, t.trips.lists.documents.validId], ...going.flatMap((p) => ((data) => (data ? [[p.name, yes(data.validId)]] : []))(of<'dokumente'>(p)?.data))];
		case 'einverstaendnis': {
			const f = t.trips.lists.consents;
			return [
				[h.name, f.photos, f.travelAlone, f.freeTime, h.savedBy],
				...going.flatMap((p) => {
					const entry = of<'einverstaendnis'>(p);
					return entry ? [[p.name, yes(entry.data.photos), yes(entry.data.travelAlone), yes(entry.data.freeTime), entry.savedBy === p.email ? '' : t.trips.lists.byParent]] : [];
				})
			];
		}
		case 'fragen':
			return [[h.name, ...questions.map((q) => q.text)], ...going.flatMap((p) => ((data) => (data ? [[p.name, ...questions.map((q) => data[q.id] ?? '')]] : []))(of<'fragen'>(p)?.data as ListAnswers['fragen'] | undefined))];
	}
	return [];
}

/** The kitchen's list: counts by diet and allergy without names, then the names it needs. */
export function kitchenRows(participants: Participant[], entries: ListEntry[]): string[][] {
	const summary = kitchen(participants, entries);
	const f = t.trips.lists.diet;
	const k = t.trips.lists.kitchen;
	return [
		[k.diet, k.count],
		...summary.diets.map(({ diet, count }) => [diet === 'unbekannt' ? k.unknown : f.diets[diet], String(count)]),
		[k.people, String(summary.people)],
		[],
		[k.allergy, f.severity, k.count],
		...summary.allergies.map(({ what, severity, count }) => [what, f.severities[severity], String(count)]),
		[],
		[k.named, f.diet, f.allergies, f.dietNote],
		...summary.named.map((one) => [one.name, f.diets[one.diet], one.allergies.map((a) => `${a.what} (${f.severities[a.severity]})`).join(', '), one.dietNote ?? ''])
	];
}
