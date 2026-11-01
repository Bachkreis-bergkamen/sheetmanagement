import { describe, expect, it } from 'vitest';
import {
	admit,
	buyer,
	doorList,
	freeGuest,
	freeTickets,
	fromLocalInput,
	localInput,
	looksLikeCode,
	onlineFeeOf,
	orderTickets,
	parsePrices,
	pricesText,
	priceOn,
	randomCode,
	saleCounts,
	saleState,
	searchDoor,
	type Ticket,
	type TicketOrder,
	type TicketSale
} from './tickets.ts';

const sale: TicketSale = {
	concertId: 'c1',
	seating: 'free',
	capacity: 400,
	prices: [
		{ type: 'erwachsene', label: 'Erwachsene', cents: 1200 },
		{ type: 'kinder-bis-12', label: 'Kinder bis 12', cents: 0 }
	],
	onlineFee: { percent: 3.5, cents: 25 },
	onlineUntil: '2026-11-21T14:00:00.000Z',
	open: true
};

describe('randomCode', () => {
	it('is 26 base32 letters, different every time', () => {
		const code = randomCode();
		expect(looksLikeCode(code)).toBe(true);
		expect(randomCode()).not.toBe(code);
		expect(looksLikeCode('abc')).toBe(false);
	});
});

describe('parsePrices', () => {
	it('reads one kind per line with the price last', () => {
		expect(parsePrices('Erwachsene 12\nErmäßigt: 6,50 €\n\nKinder bis 12 0')).toEqual([
			{ type: 'erwachsene', label: 'Erwachsene', cents: 1200 },
			{ type: 'ermaessigt', label: 'Ermäßigt', cents: 650 },
			{ type: 'kinder-bis-12', label: 'Kinder bis 12', cents: 0 }
		]);
	});

	it('refuses lines without a price, and the same kind twice', () => {
		expect(parsePrices('Erwachsene')).toBeNull();
		expect(parsePrices('Erwachsene 12\nerwachsene 10')).toBeNull();
		expect(parsePrices('')).toBeNull();
	});

	it('writes them back as typed', () => {
		const prices = parsePrices('Erwachsene 12\nErmäßigt 6,50')!;
		expect(pricesText(prices)).toBe('Erwachsene 12\nErmäßigt 6,50');
	});
});

describe('the online surcharge', () => {
	it('is the percentage rounded up to the cent, plus the fixed part', () => {
		// 3.5 % of 12 € = 42 ct, plus 25 ct.
		expect(onlineFeeOf(1200, sale.onlineFee)).toBe(67);
		expect(onlineFeeOf(999, { percent: 0.77, cents: 0 })).toBe(8);
		expect(onlineFeeOf(1000, { percent: 0, cents: 0 })).toBe(0);
	});

	it('leaves free tickets free and the Kasse without it', () => {
		expect(onlineFeeOf(0, sale.onlineFee)).toBe(0);
		expect(priceOn(sale.prices[0], sale.onlineFee, 'online')).toEqual({ cents: 1267, feeCents: 67 });
		expect(priceOn(sale.prices[0], sale.onlineFee, 'abendkasse')).toEqual({ cents: 1200, feeCents: 0 });
	});
});

describe('orderTickets', () => {
	it('makes one ticket per seat with its price and surcharge', () => {
		expect(orderTickets(sale, { erwachsene: 2, 'kinder-bis-12': 1 })).toEqual([
			{ type: 'erwachsene', cents: 1267, feeCents: 67 },
			{ type: 'erwachsene', cents: 1267, feeCents: 67 },
			{ type: 'kinder-bis-12', cents: 0, feeCents: 0 }
		]);
	});

	it('says what’s wrong', () => {
		expect(orderTickets(sale, {})).toBe('empty');
		expect(orderTickets(sale, { erwachsene: 0 })).toBe('empty');
		expect(orderTickets(sale, { erwachsene: 11 })).toBe('tooMany');
		expect(orderTickets(sale, { vip: 1 })).toBe('unknownType');
		expect(orderTickets(sale, { erwachsene: 1.5 })).toBe('unknownType');
	});
});

describe('buyer', () => {
	it('tidies the name and e-mail', () => {
		expect(buyer('  Anna   Bach ', ' Anna@Example.org ')).toEqual({ name: 'Anna Bach', email: 'anna@example.org' });
		expect(buyer('A', 'a@b.de')).toBe('name');
		expect(buyer('Anna', 'anna')).toBe('email');
	});
});

describe('freeGuest', () => {
	it('takes a name and how many, the e-mail only if given', () => {
		expect(freeGuest(' Frau  Bürgermeisterin ', '', '2')).toEqual({ name: 'Frau Bürgermeisterin', email: '', count: 2 });
		expect(freeGuest('Anna', ' Anna@Example.org ', 1)).toEqual({ name: 'Anna', email: 'anna@example.org', count: 1 });
		expect(freeGuest('Anna', 'anna', 1)).toBe('email');
		expect(freeGuest('A', '', 1)).toBe('name');
		expect(freeGuest('Anna', '', 0)).toBe('count');
		expect(freeGuest('Anna', '', 11)).toBe('count');
		expect(freeGuest('Anna', '', '1,5')).toBe('count');
	});

	it('makes tickets that cost nothing', () => {
		expect(freeTickets(2)).toEqual([
			{ type: 'freikarte', cents: 0, feeCents: 0 },
			{ type: 'freikarte', cents: 0, feeCents: 0 }
		]);
	});
});

describe('saleState', () => {
	const now = Date.parse('2026-11-20T12:00:00Z');
	it('is open until the end, the capacity or the organiser closes it', () => {
		expect(saleState(sale, 10, now)).toBe('open');
		expect(saleState(sale, 400, now)).toBe('soldout');
		expect(saleState(sale, 10, Date.parse(sale.onlineUntil))).toBe('ended');
		expect(saleState({ ...sale, open: false }, 10, now)).toBe('closed');
		expect(saleState(null, 0, now)).toBe('closed');
	});
});

const orders: TicketOrder[] = [
	{ id: 'o1', concertId: 'c1', name: 'Zoe Ärmel', email: 'z@x.org', channel: 'online', status: 'reserved', createdAt: '' },
	{ id: 'o2', concertId: 'c1', name: 'Anna Bach', email: 'a@x.org', channel: 'online', status: 'cancelled', createdAt: '' },
	{ id: 'o3', concertId: 'c1', name: 'Bernd Arm', email: '', channel: 'abendkasse', status: 'paid', createdAt: '' },
	{ id: 'o4', concertId: 'c1', name: 'Clara Gast', email: '', channel: 'free', status: 'paid', createdAt: '' }
];
const tickets: Ticket[] = [
	{ code: 'A', orderId: 'o1', concertId: 'c1', seat: '', type: 'erwachsene', cents: 1267, feeCents: 67, checkedInAt: '2026-11-21T16:00:00Z' },
	{ code: 'B', orderId: 'o1', concertId: 'c1', seat: '', type: 'kinder-bis-12', cents: 0, feeCents: 0 },
	{ code: 'C', orderId: 'o2', concertId: 'c1', seat: '', type: 'erwachsene', cents: 1267, feeCents: 67 },
	{ code: 'D', orderId: 'o3', concertId: 'c1', seat: '', type: 'erwachsene', cents: 1200, feeCents: 0 },
	{ code: 'E', orderId: 'o4', concertId: 'c1', seat: '', type: 'freikarte', cents: 0, feeCents: 0 }
];

describe('saleCounts', () => {
	it('counts what isn’t cancelled, with the surcharges and the Freikarten apart', () => {
		expect(saleCounts(orders, tickets)).toEqual({ sold: 3, free: 1, checkedIn: 1, cents: 2467, feeCents: 67, byType: { erwachsene: 2, 'kinder-bis-12': 1, freikarte: 1 } });
	});
});

describe('at the door', () => {
	const list = doorList(orders, tickets);
	const byCode = new Map(list.map((ticket) => [ticket.code, ticket]));

	it('keeps the valid tickets by name, Freikarten too', () => {
		expect(list.map((ticket) => ticket.code)).toEqual(['D', 'E', 'A', 'B']);
	});

	it('lets a ticket in once and knows no others', () => {
		expect(admit(byCode, 'b')).toMatchObject({ ok: true, ticket: { name: 'Zoe Ärmel' } });
		expect(admit(byCode, 'A')).toMatchObject({ ok: false, reason: 'used' });
		expect(admit(byCode, 'C')).toEqual({ ok: false, reason: 'unknown' });
	});

	it('finds people by any part of their name', () => {
		expect(searchDoor(list, 'arm').map((ticket) => ticket.code)).toEqual(['D', 'A', 'B']);
		expect(searchDoor(list, 'zoe arm').map((ticket) => ticket.code)).toEqual(['A', 'B']);
		expect(searchDoor(list, '  ')).toEqual([]);
	});
});

describe('localInput and fromLocalInput', () => {
	it('go between instants and wall time in the orchestra’s zone, across clock changes', () => {
		expect(localInput('2026-11-21T15:00:00.000Z', 'Europe/Berlin')).toBe('2026-11-21T16:00');
		expect(fromLocalInput('2026-11-21T16:00', 'Europe/Berlin')).toBe('2026-11-21T15:00:00.000Z');
		expect(fromLocalInput('2026-07-01T18:30', 'Europe/Berlin')).toBe('2026-07-01T16:30:00.000Z');
		expect(fromLocalInput('morgen', 'Europe/Berlin')).toBeNull();
	});
});
