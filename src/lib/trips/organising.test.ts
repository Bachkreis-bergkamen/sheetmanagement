import { describe, expect, it } from 'vitest';
import type { ListEntry } from './lists.ts';
import {
	centsFrom,
	costs,
	feeChoice,
	feesFromForm,
	formatEuros,
	packedCount,
	packingFromText,
	paymentFromForm,
	pickupsFromText,
	rideBoard,
	ridesWith,
	roomBoard,
	roomFromForm,
	vehicleFromForm,
	wishedPeople,
	withTick,
	type Arrangement,
	type Vehicle
} from './organising.ts';
import type { Participant } from './trips.ts';

const form = (fields: Record<string, string | string[]>) => {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) for (const one of [value].flat()) data.append(name, one);
	return data;
};

const person = (email: string, name: string, extra: Partial<Participant> = {}): Participant => ({ tripId: 't', email, name, roles: ['musiker'], status: 'angemeldet', signedUpAt: '1', ...extra });
const wish = (email: string, data: object): ListEntry => ({ tripId: 't', email, kind: 'wuensche', data: data as never, savedAt: '1', savedBy: email });

describe('rooms and vehicles from their forms', () => {
	it('reads a room or a host family with its beds', () => {
		expect(roomFromForm(form({ name: ' Zimmer  12 ', beds: '4' }))).toEqual({ room: { kind: 'zimmer', name: 'Zimmer 12', beds: 4 } });
		expect(roomFromForm(form({ kind: 'gastfamilie', name: 'Familie Rossi', beds: '2', note: 'Via Roma 3' }))).toEqual({ room: { kind: 'gastfamilie', name: 'Familie Rossi', beds: 2, note: 'Via Roma 3' } });
		expect(roomFromForm(form({ kind: 'zelt', name: 'Z', beds: '2' }))).toEqual({ problem: 'kind' });
		expect(roomFromForm(form({ name: '', beds: '4' }))).toEqual({ problem: 'name' });
		expect(roomFromForm(form({ name: 'Z', beds: '0' }))).toEqual({ problem: 'beds' });
		expect(roomFromForm(form({ name: 'Z', beds: 'vier' }))).toEqual({ problem: 'beds' });
	});

	it('reads pick-ups a line each, with or without a time', () => {
		expect(pickupsFromText('7:30 Schulhof Bergkamen\n\n8.15 Uhr Bahnhof Kamen\nRaststätte Lichtendorf')).toEqual([
			{ time: '07:30', place: 'Schulhof Bergkamen' },
			{ time: '08:15', place: 'Bahnhof Kamen' },
			{ place: 'Raststätte Lichtendorf' }
		]);
		expect(pickupsFromText('')).toEqual([]);
		// A time alone is a place, not a pick-up without one.
		expect(pickupsFromText('25:00 Irgendwo')).toEqual([{ place: '25:00 Irgendwo' }]);
	});

	it('reads a vehicle, which goes at least one way', () => {
		expect(vehicleFromForm(form({ name: 'Reisebus', kind: 'bus', seats: '50', leg: ['rueck', 'hin'], driver: 'Herr Müller', pickups: '07:30 Schulhof' }))).toEqual({
			vehicle: { name: 'Reisebus', kind: 'bus', seats: 50, legs: ['hin', 'rueck'], driver: 'Herr Müller', pickups: [{ time: '07:30', place: 'Schulhof' }] }
		});
		expect(vehicleFromForm(form({ name: 'Zug', kind: 'bahn', leg: 'hin' }))).toEqual({ vehicle: { name: 'Zug', kind: 'bahn', legs: ['hin'], pickups: [] } });
		expect(vehicleFromForm(form({ name: 'Bus', kind: 'bus' }))).toEqual({ problem: 'legs' });
		expect(vehicleFromForm(form({ name: 'Bus', kind: 'ufo', leg: 'hin' }))).toEqual({ problem: 'kind' });
		expect(vehicleFromForm(form({ name: 'Bus', kind: 'bus', leg: 'hin', seats: '-1' }))).toEqual({ problem: 'seats' });
	});
});

describe('the packing list', () => {
	it('keeps the ids of lines that stay, so ticks stay ticked', () => {
		let n = 0;
		const before = [
			{ id: 'a', text: 'Noten' },
			{ id: 'b', text: 'Schlafsack' }
		];
		expect(packingFromText('- Schlafsack\nKonzertkleidung\n\nnoten\nNoten', before, () => `n${++n}`)).toEqual([
			{ id: 'b', text: 'Schlafsack' },
			{ id: 'n1', text: 'Konzertkleidung' },
			{ id: 'a', text: 'noten' }
		]);
	});

	it('ticks and unticks, ignoring what is no longer on the list', () => {
		const packing = [
			{ id: 'a', text: 'Noten' },
			{ id: 'b', text: 'Schlafsack' }
		];
		expect(withTick(packing, { packed: ['gone', 'b'] }, 'a', true)).toEqual(['a', 'b']);
		expect(withTick(packing, { packed: ['a', 'b'] }, 'a', false)).toEqual(['b']);
		expect(withTick(packing, undefined, 'x', true)).toEqual([]);
		expect(packedCount(packing, { packed: ['b', 'gone'] })).toEqual({ packed: 1, of: 2 });
	});
});

describe('fees', () => {
	it('reads amounts as people type them', () => {
		expect(centsFrom('120')).toBe(12000);
		expect(centsFrom('120,5')).toBe(12050);
		expect(centsFrom('120.50 €')).toBe(12050);
		expect(centsFrom('1.200')).toBe(120000);
		expect(centsFrom('1.200,99')).toBe(120099);
		expect(centsFrom('')).toBeUndefined();
		expect(centsFrom('zwölf')).toBeNull();
		// Intl puts a no-break space before the sign.
		expect(formatEuros(12000, 'de-DE').replace(/\s/g, ' ')).toBe('120 €');
		expect(formatEuros(12050, 'de-DE').replace(/\s/g, ' ')).toBe('120,50 €');
	});

	it('reads the trip’s fees and a person’s payment', () => {
		expect(feesFromForm(form({ fee: '120', feeReduced: '' }))).toEqual({ fee: 12000 });
		expect(feesFromForm(form({ fee: 'x' }))).toEqual({ problem: 'fee' });
		const trip = { fee: 12000, feeReduced: 8000 };
		expect(paymentFromForm(form({ choice: 'normal' }), trip, '2027-01-01')).toEqual({});
		expect(paymentFromForm(form({ choice: 'ermaessigt', paid: 'on' }), trip, '2027-01-01')).toEqual({ fee: 8000, paidOn: '2027-01-01' });
		expect(paymentFromForm(form({ choice: 'eigen', amount: '50', paid: 'on', paidOn: '2026-12-24' }), trip, '2027-01-01')).toEqual({ fee: 5000, paidOn: '2026-12-24' });
		expect(paymentFromForm(form({ choice: 'frei' }), trip, '2027-01-01')).toEqual({ fee: 0 });
		expect(paymentFromForm(form({ choice: 'ermaessigt' }), { fee: 12000 }, '2027-01-01')).toEqual({ problem: 'fee' });
		expect(paymentFromForm(form({ choice: 'eigen', amount: '' }), trip, '2027-01-01')).toEqual({ problem: 'fee' });
		expect(feeChoice(trip, { fee: 8000 })).toBe('ermaessigt');
		expect(feeChoice(trip, { fee: 12000 })).toBe('normal');
		expect(feeChoice(trip, { fee: 3000 })).toBe('eigen');
	});

	it('sums what is due, paid and open for those going', () => {
		const participants = [person('a@x', 'Anna'), person('b@x', 'Ben'), person('c@x', 'Cleo'), person('d@x', 'Dora', { status: 'warteliste' })];
		const arrangements: Arrangement[] = [
			{ tripId: 't', email: 'a@x', paidOn: '2027-01-02' },
			{ tripId: 't', email: 'b@x', fee: 8000 },
			{ tripId: 't', email: 'c@x', fee: 0 }
		];
		const result = costs({ fee: 12000, feeReduced: 8000 }, participants, arrangements);
		expect(result.rows.map((row) => [row.name, row.fee, row.choice, row.paidOn])).toEqual([
			['Anna', 12000, 'normal', '2027-01-02'],
			['Ben', 8000, 'ermaessigt', undefined],
			['Cleo', 0, 'frei', undefined]
		]);
		expect(result).toMatchObject({ due: 20000, paid: 12000, open: 8000, unpaid: 1 });
	});
});

describe('who sleeps and rides where', () => {
	it('finds whom a wish names, by full name or a first name only one has', () => {
		const others = [
			{ email: 'p', name: 'Paul Probe' },
			{ email: 'j', name: 'Jonas Geiger' },
			{ email: 'j2', name: 'Jonas Bach' },
			{ email: 'l', name: 'Lea Lang' }
		];
		expect(wishedPeople('Paul und Lea', others)).toEqual(['p', 'l']);
		expect(wishedPeople('Jonas', others)).toEqual([]);
		expect(wishedPeople('jonas geiger bitte', others)).toEqual(['j']);
		expect(wishedPeople('egal', others)).toEqual([]);
		// Not inside another word.
		expect(wishedPeople('Leander', others)).toEqual([]);
	});

	it('warns of a full room, an unmet wish and a young player alone with grown-ups', () => {
		const rooms = [
			{ id: 'r1', name: 'Zimmer 1', beds: 2 },
			{ id: 'r2', name: 'Zimmer 2', beds: 4 }
		];
		const participants = [person('j@x', 'Jonas Geiger'), person('p@x', 'Paul Probe'), person('t@x', 'Tim Trompeter'), person('k@x', 'Kim Kind'), person('n@x', 'Nora Neu'), person('w@x', 'Wanda Wait', { status: 'warteliste' })];
		const arrangements: Arrangement[] = [
			{ tripId: 't', email: 'j@x', room: 'r1' },
			{ tripId: 't', email: 't@x', room: 'r1' },
			{ tripId: 't', email: 'n@x', room: 'r1' },
			{ tripId: 't', email: 'k@x', room: 'r2' },
			{ tripId: 't', email: 'p@x', room: 'r2' },
			{ tripId: 't', email: 'w@x', room: 'r2' }
		];
		const board = roomBoard({ rooms }, participants, arrangements, [wish('j@x', { roomWith: 'Paul' }), wish('p@x', { roomWith: 'Jonas Geiger' })], new Set(['k@x']));
		expect(board.units.map((unit) => [unit.unit.id, unit.people.map((p) => p.name), unit.warnings])).toEqual([
			['r1', ['Jonas Geiger', 'Nora Neu', 'Tim Trompeter'], [{ kind: 'full', over: 1 }, { kind: 'wish', names: ['Jonas Geiger'] }]],
			['r2', ['Kim Kind', 'Paul Probe'], [{ kind: 'wish', names: ['Paul Probe'] }, { kind: 'young' }]]
		]);
		expect(board.unplaced).toEqual([]);
		expect(board.units[0].people[0]).toMatchObject({ wish: 'Paul', wishMet: false });

		const together = roomBoard({ rooms }, participants, [...arrangements.filter((one) => one.email !== 'p@x'), { tripId: 't', email: 'p@x', room: 'r1' }], [wish('j@x', { roomWith: 'Paul' })], new Set());
		expect(together.units[0].people.find((p) => p.email === 'j@x')).toMatchObject({ wishMet: true });
		expect(together.units[0].warnings).toEqual([{ kind: 'full', over: 2 }]);

		// With a host family a young player stays alone with grown-ups, as everyone does.
		const family = roomBoard({ rooms: [{ id: 'f', kind: 'gastfamilie', name: 'Familie Rossi', beds: 2 }] }, participants, [{ tripId: 't', email: 'k@x', room: 'f' }, { tripId: 't', email: 't@x', room: 'f' }], [], new Set(['k@x']));
		expect(family.units[0].warnings).toEqual([]);
	});

	it('puts people in the vehicles of one way, with their big instruments, and nobody in a removed one', () => {
		const bus: Vehicle = { id: 'v1', name: 'Bus', kind: 'bus', seats: 2, legs: ['hin', 'rueck'], pickups: [] };
		const car: Vehicle = { id: 'v2', name: 'Auto', kind: 'auto', seats: 4, legs: ['rueck'], pickups: [] };
		const participants = [person('a@x', 'Anna'), person('b@x', 'Bea Bass'), person('c@x', 'Cleo')];
		const arrangements: Arrangement[] = [
			{ tripId: 't', email: 'a@x', rides: { hin: 'v1', rueck: 'v2' } },
			{ tripId: 't', email: 'b@x', rides: { hin: 'v1', rueck: 'gone' } },
			{ tripId: 't', email: 'c@x', rides: { hin: 'v1' } }
		];
		const bass = { person: 'Bea Bass', instrument: { id: 'i', email: 'b@x', name: 'Kontrabass', owner: 'eigen' as const, insurance: 'gruppe' as const, bulky: true } };
		const there = rideBoard({ vehicles: [bus, car] }, 'hin', participants, arrangements, [], new Set(), [bass]);
		expect(there.units.map((unit) => [unit.unit.id, unit.people.length, unit.warnings, unit.instruments])).toEqual([['v1', 3, [{ kind: 'full', over: 1 }], ['Kontrabass (Bea Bass)']]]);
		const back = rideBoard({ vehicles: [bus, car] }, 'rueck', participants, arrangements, [], new Set());
		expect(back.units.map((unit) => [unit.unit.id, unit.people.map((p) => p.email)])).toEqual([
			['v1', []],
			['v2', ['a@x']]
		]);
		expect(back.unplaced.map((p) => p.email)).toEqual(['b@x', 'c@x']);
	});

	it('takes a vehicle that goes both ways for the other way too, when that one has none', () => {
		const bus: Vehicle = { id: 'v1', name: 'Bus', kind: 'bus', legs: ['hin', 'rueck'], pickups: [] };
		const car: Vehicle = { id: 'v2', name: 'Auto', kind: 'auto', legs: ['hin'], pickups: [] };
		expect(ridesWith(undefined, bus, 'hin')).toEqual({ hin: 'v1', rueck: 'v1' });
		expect(ridesWith({ tripId: 't', email: 'a', rides: { rueck: 'v9' } }, bus, 'hin')).toEqual({ hin: 'v1', rueck: 'v9' });
		expect(ridesWith(undefined, car, 'hin')).toEqual({ hin: 'v2' });
		expect(ridesWith({ tripId: 't', email: 'a', rides: { hin: 'v1', rueck: 'v1' } }, undefined, 'hin')).toEqual({ rueck: 'v1' });
	});
});
