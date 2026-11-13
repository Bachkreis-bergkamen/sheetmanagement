import type { InstrumentRow, ListAnswers, ListEntry } from './lists.ts';
import type { Participant, Trip } from './trips.ts';

/**
 * Organising a trip (#334, step 3): where people sleep (rooms, or the host families the partner
 * ensemble assigns), the bus and the cars there and back, what each person pays, and one packing
 * list for everyone to tick off.
 *
 * The places to sleep, vehicles, fees and packing list belong to the trip; who sleeps and rides
 * where, what they pay and what they packed is kept per person (an Arrangement), apart from the
 * sign-up, so signing up again changes nothing of it.
 *
 * Hosting guests at home on a return visit is the other way round and doesn't depend on who went:
 * that's the guest lists of #297, not this.
 */

/** A room of the hostel, or a host family abroad. */
export const STAY_KINDS = ['zimmer', 'gastfamilie'] as const;
export type StayKind = (typeof STAY_KINDS)[number];

/** Somewhere to sleep: "Zimmer 12", or "Familie Rossi" with two beds. */
export interface Room {
	id: string;
	/** "Zimmer 12", "Familie Rossi". Trips before host families have only rooms. */
	kind?: StayKind;
	name: string;
	beds: number;
	/** The family's address or how to reach them, a room's floor. */
	note?: string;
}

export const stayKind = (room: Pick<Room, 'kind'>): StayKind => room.kind ?? 'zimmer';

export const VEHICLE_KINDS = ['bus', 'auto', 'transporter', 'bahn', 'flugzeug'] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

/** There, back. */
export const LEGS = ['hin', 'rueck'] as const;
export type Leg = (typeof LEGS)[number];

/** Where and when a vehicle picks people up: "07:30 Schulhof Bergkamen". */
export interface Pickup {
	time?: string;
	place: string;
}

export interface Vehicle {
	id: string;
	/** "Reisebus Müller", "Auto Tim". */
	name: string;
	kind: VehicleKind;
	/** Seats for people, the driver's included; without one, no limit (a train). */
	seats?: number;
	/** Which ways it goes: there, back, or both. Never empty. */
	legs: Leg[];
	/** Who drives, as written. */
	driver?: string;
	pickups: Pickup[];
	note?: string;
}

export interface PackItem {
	id: string;
	text: string;
}

/** What the trip itself says about its organising. */
export interface Organising {
	rooms: Room[];
	vehicles: Vehicle[];
	packing: PackItem[];
	/** The fee per person, in cents; without one, the trip costs nothing. */
	fee?: number;
	/** The reduced fee, in cents, e.g. for pupils or siblings. */
	feeReduced?: number;
}

/** One person on one trip: where they sleep and ride, what they pay, what they packed. */
export interface Arrangement {
	tripId: string;
	email: string;
	room?: string;
	/** A vehicle's id per way. */
	rides?: Partial<Record<Leg, string>>;
	/** Their own fee in cents, instead of the trip's; 0 for free. */
	fee?: number;
	/** The day they paid, "2027-02-01"; without one, still open. */
	paidOn?: string;
	/** The packing list's items they ticked. */
	packed?: string[];
}

export const organisingOf = (trip: Partial<Organising>): Organising => ({
	rooms: trip.rooms ?? [],
	vehicles: trip.vehicles ?? [],
	packing: trip.packing ?? [],
	...(trip.fee !== undefined ? { fee: trip.fee } : {}),
	...(trip.feeReduced !== undefined ? { feeReduced: trip.feeReduced } : {})
});

export const ROOMS_MAX = 200;
export const VEHICLES_MAX = 50;
export const PICKUPS_MAX = 10;
export const PACKING_MAX = 60;
export const NAME_MAX = 80;
export const ITEM_MAX = 120;
export const NOTE_MAX = 500;
/** 100 000 € in cents: more than any trip costs. */
export const FEE_MAX = 10_000_000;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]?\d|2[0-3])[:.][0-5]\d$/;

const text = (form: FormData, name: string) =>
	String(form.get(name) ?? '')
		.trim()
		.replace(/[ \t]+/g, ' ');

export type OrganisingProblem = 'name' | 'beds' | 'seats' | 'legs' | 'kind' | 'pickup' | 'fee' | 'day' | 'too-long' | 'too-many';

/** A room or host family from its form: what it is, a name and its beds. */
export function roomFromForm(form: FormData): { room: Omit<Room, 'id'> } | { problem: OrganisingProblem } {
	const kind = (text(form, 'kind') || 'zimmer') as StayKind;
	const name = text(form, 'name');
	const beds = Number(text(form, 'beds'));
	const note = String(form.get('note') ?? '').trim();
	if (!STAY_KINDS.includes(kind)) return { problem: 'kind' };
	if (!name) return { problem: 'name' };
	if (!Number.isInteger(beds) || beds < 1 || beds > 100) return { problem: 'beds' };
	if (name.length > NAME_MAX || note.length > NOTE_MAX) return { problem: 'too-long' };
	return { room: { kind, name, beds, ...(note ? { note } : {}) } };
}

/**
 * Pick-ups as typed, one a line: "07:30 Schulhof Bergkamen", "8.15 Bahnhof Kamen", or a place
 * alone. The time goes as "07:30".
 */
export function pickupsFromText(value: string): Pickup[] | null {
	const pickups: Pickup[] = [];
	for (const line of value.split(/\r?\n/)) {
		const clean = line.trim().replace(/\s+/g, ' ');
		if (!clean) continue;
		const [first, ...rest] = clean.split(' ');
		const timed = TIME.test(first.replace(/\s*uhr$/i, '')) && rest.length;
		const place = timed ? rest.join(' ').replace(/^(uhr|h)\b\s*/i, '') : clean;
		if (!place || place.length > NAME_MAX * 2) return null;
		if (timed) {
			const [hours, minutes] = first.split(/[:.]/);
			pickups.push({ time: `${hours.padStart(2, '0')}:${minutes}`, place });
		} else pickups.push({ place });
	}
	return pickups.length > PICKUPS_MAX ? null : pickups;
}

export const pickupsText = (pickups: Pickup[]) => pickups.map((pickup) => (pickup.time ? `${pickup.time} ${pickup.place}` : pickup.place)).join('\n');

/** A vehicle from its form: name, kind, seats, the ways it goes, who drives, where it picks people up. */
export function vehicleFromForm(form: FormData): { vehicle: Omit<Vehicle, 'id'> } | { problem: OrganisingProblem } {
	const name = text(form, 'name');
	const kind = text(form, 'kind') as VehicleKind;
	const seatsText = text(form, 'seats');
	const driver = text(form, 'driver');
	const note = text(form, 'note');
	const ticked = new Set(form.getAll('leg').map(String));
	const legs = LEGS.filter((leg) => ticked.has(leg));
	if (!name) return { problem: 'name' };
	if (!VEHICLE_KINDS.includes(kind)) return { problem: 'kind' };
	if (!legs.length) return { problem: 'legs' };
	let seats: number | undefined;
	if (seatsText) {
		seats = Number(seatsText);
		if (!Number.isInteger(seats) || seats < 1 || seats > 500) return { problem: 'seats' };
	}
	if (name.length > NAME_MAX || driver.length > NAME_MAX || note.length > NOTE_MAX) return { problem: 'too-long' };
	const pickups = pickupsFromText(String(form.get('pickups') ?? ''));
	if (!pickups) return { problem: 'pickup' };
	return { vehicle: { name, kind, legs, pickups, ...(seats ? { seats } : {}), ...(driver ? { driver } : {}), ...(note ? { note } : {}) } };
}

/**
 * The packing list from its lines, one thing a line. A line that was there before keeps its id,
 * so what people ticked stays ticked when the organisers add or reorder things.
 */
export function packingFromText(value: string, before: PackItem[], newId: () => string): PackItem[] | null {
	const typed = value.split(/\r?\n/).map((line) => line.trim().replace(/^[-*•]\s*/, '').replace(/\s+/g, ' ')).filter(Boolean);
	// "Noten" twice, in any case, is one thing.
	const lines = typed.filter((line, i) => typed.findIndex((other) => other.toLowerCase() === line.toLowerCase()) === i);
	if (lines.length > PACKING_MAX || lines.some((line) => line.length > ITEM_MAX)) return null;
	const known = new Map(before.map((item) => [item.text.toLowerCase(), item.id]));
	return lines.map((line) => ({ id: known.get(line.toLowerCase()) ?? newId(), text: line }));
}

/** "120", "120,50", "120.50 €", "1.200" → cents; empty → undefined; null when it isn't an amount. */
export function centsFrom(value: string): number | undefined | null {
	const clean = value.replace(/€|eur/gi, '').replace(/\s/g, '');
	if (!clean) return undefined;
	// "1.200,50" or "1,200.50": the last separator with two digits after it is the decimal one.
	const match = /^(\d{1,3}(?:[.,]\d{3})*|\d+)(?:[.,](\d{1,2}))?$/.exec(clean);
	if (!match) return null;
	const cents = Number(match[1].replace(/[.,]/g, '')) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
	return cents > FEE_MAX ? null : cents;
}

/** "120 €", "120,50 €". */
export function formatEuros(cents: number, locale: string): string {
	return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
}

/** The trip's fees from their form: the usual and the reduced one, both optional. */
export function feesFromForm(form: FormData): { fee?: number; feeReduced?: number } | { problem: OrganisingProblem } {
	const fee = centsFrom(text(form, 'fee'));
	const feeReduced = centsFrom(text(form, 'feeReduced'));
	if (fee === null || feeReduced === null) return { problem: 'fee' };
	return { ...(fee !== undefined ? { fee } : {}), ...(feeReduced !== undefined ? { feeReduced } : {}) };
}

export const FEE_CHOICES = ['normal', 'ermaessigt', 'frei', 'eigen'] as const;
export type FeeChoice = (typeof FEE_CHOICES)[number];

/**
 * A person's payment from its row: which fee (the usual, reduced, free, or their own amount)
 * and whether and when they paid.
 */
export function paymentFromForm(form: FormData, trip: Partial<Organising>, today: string): Pick<Arrangement, 'fee' | 'paidOn'> | { problem: OrganisingProblem } {
	const choice = text(form, 'choice') as FeeChoice;
	let fee: number | undefined;
	if (choice === 'ermaessigt') {
		if (trip.feeReduced === undefined) return { problem: 'fee' };
		fee = trip.feeReduced;
	} else if (choice === 'frei') fee = 0;
	else if (choice === 'eigen') {
		const own = centsFrom(text(form, 'amount'));
		if (own === undefined || own === null) return { problem: 'fee' };
		fee = own;
	} else if (choice !== 'normal') return { problem: 'fee' };
	const paid = form.get('paid') === 'on';
	const paidOn = text(form, 'paidOn');
	if (paid && paidOn && (!DAY.test(paidOn) || Number.isNaN(Date.parse(paidOn)))) return { problem: 'day' };
	return { ...(fee !== undefined ? { fee } : {}), ...(paid ? { paidOn: paidOn || today } : {}) };
}

/** What someone pays: their own fee, else the trip's; nothing without either. */
export const feeOf = (trip: Partial<Organising>, arrangement?: Pick<Arrangement, 'fee'>) => arrangement?.fee ?? trip.fee ?? 0;

/** Which of the choices a person's fee is, for the select. */
export function feeChoice(trip: Partial<Organising>, arrangement?: Pick<Arrangement, 'fee'>): FeeChoice {
	const fee = arrangement?.fee;
	if (fee === undefined || fee === trip.fee) return 'normal';
	if (fee === 0) return 'frei';
	return fee === trip.feeReduced ? 'ermaessigt' : 'eigen';
}

export interface CostRow {
	email: string;
	name: string;
	fee: number;
	choice: FeeChoice;
	paidOn?: string;
}

/** The fees of everyone going, what came in and what's still open. */
export function costs(trip: Partial<Organising>, participants: Participant[], arrangements: Arrangement[]) {
	const of = new Map(arrangements.map((one) => [one.email, one]));
	const rows: CostRow[] = going(participants).map((p) => {
		const arrangement = of.get(p.email);
		return { email: p.email, name: p.name, fee: feeOf(trip, arrangement), choice: feeChoice(trip, arrangement), ...(arrangement?.paidOn ? { paidOn: arrangement.paidOn } : {}) };
	});
	const due = rows.reduce((sum, row) => sum + row.fee, 0);
	const paid = rows.reduce((sum, row) => sum + (row.paidOn ? row.fee : 0), 0);
	return { rows, due, paid, open: due - paid, unpaid: rows.filter((row) => row.fee > 0 && !row.paidOn).length };
}

/** Those holding a place, by name: the people rooms and seats are for. */
const going = (participants: Participant[]) => participants.filter((p) => p.status === 'angemeldet').sort((a, b) => a.name.localeCompare(b.name));

/**
 * Whom a wish names among the others: "Paul Probe", "Paul", "Paul und Jonas", by the full name
 * or the first name alone when only one person has it.
 */
export function wishedPeople(wish: string | undefined, others: { email: string; name: string }[]): string[] {
	if (!wish?.trim()) return [];
	const said = wish.toLowerCase();
	const contains = (name: string) => new RegExp(`(^|[^\\p{L}])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(said);
	const firstNames = new Map<string, number>();
	for (const other of others) {
		const first = other.name.split(' ')[0].toLowerCase();
		firstNames.set(first, (firstNames.get(first) ?? 0) + 1);
	}
	return others
		.filter((other) => {
			const first = other.name.split(' ')[0];
			return contains(other.name) || (firstNames.get(first.toLowerCase()) === 1 && first.length > 1 && contains(first));
		})
		.map((other) => other.email);
}

export interface BoardPerson {
	email: string;
	name: string;
	/** A young player (#299). */
	young: boolean;
	/** Their wish as written, and whether it's met where they are. */
	wish?: string;
	wishMet?: boolean;
}

export type UnitWarning = { kind: 'full'; over: number } | { kind: 'wish'; names: string[] } | { kind: 'young' };

export interface BoardUnit<U> {
	unit: U;
	people: BoardPerson[];
	warnings: UnitWarning[];
}

/**
 * Who is where, for one kind of thing to share (rooms, or the vehicles of one way): each with its
 * people and what's wrong with it, and who has nowhere yet.
 *
 * Warnings: more people than places, a wish that isn't met, and a young player sharing a room with
 * grown-ups only (a room of young players with a Betreuer·in is the organisers' call, so a young
 * player among others of their age never warns).
 */
function board<U extends { id: string }>(
	units: U[],
	places: (unit: U) => number | undefined,
	where: (arrangement: Arrangement | undefined) => string | undefined,
	participants: Participant[],
	arrangements: Arrangement[],
	wishOf: (email: string) => string | undefined,
	young: Set<string>,
	checkYoung: (unit: U) => boolean
) {
	const people = going(participants);
	const of = new Map(arrangements.map((one) => [one.email, one]));
	const known = new Set(units.map((unit) => unit.id));
	const unitOf = (email: string) => {
		const id = where(of.get(email));
		return id && known.has(id) ? id : undefined;
	};
	const wished = new Map(people.map((p) => [p.email, wishedPeople(wishOf(p.email), people.filter((other) => other.email !== p.email))]));
	const person = (p: Participant): BoardPerson => {
		const wish = wishOf(p.email);
		const names = wished.get(p.email) ?? [];
		const here = unitOf(p.email);
		return {
			email: p.email,
			name: p.name,
			young: young.has(p.email),
			...(wish ? { wish, wishMet: !!here && names.length > 0 && names.every((email) => unitOf(email) === here) } : {})
		};
	};
	return {
		units: units.map((unit): BoardUnit<U> => {
			const inside = people.filter((p) => unitOf(p.email) === unit.id).map(person);
			const warnings: UnitWarning[] = [];
			const limit = places(unit);
			if (limit !== undefined && inside.length > limit) warnings.push({ kind: 'full', over: inside.length - limit });
			// Only wishes that name someone found: "egal" or a name not on the trip can't be met here.
			const unmet = inside.filter((p) => !p.wishMet && (wished.get(p.email) ?? []).length > 0);
			if (unmet.length) warnings.push({ kind: 'wish', names: unmet.map((p) => p.name) });
			if (checkYoung(unit) && inside.some((p) => p.young) && inside.filter((p) => p.young).length === 1 && inside.some((p) => !p.young)) warnings.push({ kind: 'young' });
			return { unit, people: inside, warnings };
		}),
		unplaced: people.filter((p) => !unitOf(p.email)).map(person)
	};
}

const wishes = (entries: ListEntry[], key: 'roomWith' | 'busWith') => {
	const of = new Map(entries.filter((entry): entry is ListEntry<'wuensche'> => entry.kind === 'wuensche').map((entry) => [entry.email, (entry.data as ListAnswers['wuensche'])[key]]));
	return (email: string) => of.get(email)?.trim() || undefined;
};

/** The rooms and host families with their people and warnings, and who has no bed yet. */
export function roomBoard(trip: Partial<Organising>, participants: Participant[], arrangements: Arrangement[], entries: ListEntry[], young: Set<string>) {
	return board(
		trip.rooms ?? [],
		(room) => room.beds,
		(one) => one?.room,
		participants,
		arrangements,
		wishes(entries, 'roomWith'),
		young,
		// A young player stays with a host family alone, as everyone does; only a hostel room warns.
		(room) => stayKind(room) === 'zimmer'
	);
}

/** The vehicles of one way with their people, the big instruments they carry and warnings, and who has no seat yet. */
export function rideBoard(trip: Partial<Organising>, leg: Leg, participants: Participant[], arrangements: Arrangement[], entries: ListEntry[], young: Set<string>, bulky: InstrumentRow[] = []) {
	const result = board(
		(trip.vehicles ?? []).filter((vehicle) => vehicle.legs.includes(leg)),
		(vehicle) => vehicle.seats,
		(one) => one?.rides?.[leg],
		participants,
		arrangements,
		wishes(entries, 'busWith'),
		young,
		() => false
	);
	return {
		...result,
		units: result.units.map((unit) => ({ ...unit, instruments: bulky.filter((row) => unit.people.some((p) => p.email === row.instrument.email)).map((row) => `${row.instrument.name} (${row.person})`) }))
	};
}

/** A vehicle's id for the way, or for both when it goes both ways and the other way has none yet. */
export function ridesWith(arrangement: Arrangement | undefined, vehicle: Vehicle | undefined, leg: Leg): Arrangement['rides'] {
	const rides = { ...arrangement?.rides };
	if (!vehicle) {
		delete rides[leg];
		return rides;
	}
	rides[leg] = vehicle.id;
	const other: Leg = leg === 'hin' ? 'rueck' : 'hin';
	if (vehicle.legs.includes(other) && !rides[other]) rides[other] = vehicle.id;
	return rides;
}

/** Things nearly every trip needs; the organisers start from these and change them. */
export const PACKING_SUGGESTIONS = {
	konzertfahrt: ['Noten und Bleistift', 'Instrument mit Zubehör', 'Notenständer', 'Konzertkleidung', 'Ausweis oder Reisepass', 'Krankenversicherungskarte', 'Bettwäsche oder Schlafsack', 'Handtuch', 'Waschzeug', 'Regenjacke', 'Ladekabel'],
	probenfahrt: ['Noten und Bleistift', 'Instrument mit Zubehör', 'Notenständer', 'Bettwäsche oder Schlafsack', 'Handtuch', 'Waschzeug', 'Hausschuhe', 'Krankenversicherungskarte', 'Etwas für den bunten Abend']
} satisfies Record<Trip['kind'], string[]>;

/** How far someone's packing is: the ticked items still on the list, of all. */
export function packedCount(packing: PackItem[], arrangement?: Pick<Arrangement, 'packed'>) {
	const ticked = new Set(arrangement?.packed ?? []);
	return { packed: packing.filter((item) => ticked.has(item.id)).length, of: packing.length };
}

/** A person's ticks with one item ticked or not; only items on the list. */
export function withTick(packing: PackItem[], arrangement: Pick<Arrangement, 'packed'> | undefined, id: string, ticked: boolean): string[] {
	const ids = new Set((arrangement?.packed ?? []).filter((one) => packing.some((item) => item.id === one)));
	if (!packing.some((item) => item.id === id)) return [...ids];
	if (ticked) ids.add(id);
	else ids.delete(id);
	return packing.filter((item) => ids.has(item.id)).map((item) => item.id);
}
