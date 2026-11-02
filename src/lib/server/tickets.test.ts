import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from './db/memory.ts';
import type { Store } from './db/types.ts';

let store: Store;
const sent: { to: string; subject: string; text: string }[] = [];

vi.mock('./db/index.ts', () => ({ getStore: () => store }));
vi.mock('./env.ts', () => ({ orchestra: () => ({ name: 'Musterorchester' }) }));
vi.mock('./mail/index.ts', () => ({
	mailAccount: async () => ({ email: 'orchester@example.org', origin: 'https://noten.example.org', connectedAt: '' }),
	sendMail: async (to: string, subject: string, text: string) => (sent.push({ to, subject, text }), true)
}));
const concert = {
	id: 'herbst',
	type: 'konzert',
	displayTitle: 'Herbstkonzert',
	start: '2026-11-21T16:00:00.000Z',
	end: '2026-11-21T18:00:00.000Z',
	past: false,
	location: 'Aula',
	date: { long: 'Samstag, 21. November 2026', time: '17:00 – 19:00' }
};
// Given with a guest choir; "gast" is organised by it, so it sells its own tickets.
const kch = { shortName: 'KCH', name: 'Kammerchor Unna', kind: 'Chor', website: 'https://kch.example.org' };
const guestConcert = { ...concert, id: 'gast' };
vi.mock('./library.ts', () => ({
	getLibrary: async () => ({
		schedule: { ok: true, byId: new Map([['herbst', concert], ['gast', guestConcert]]) },
		concertsById: new Map([
			['herbst', { partners: [kch] }],
			['gast', { partners: [kch], organizer: kch }]
		])
	})
}));

const { publicSale, reserve, pruneTickets, giveFreeTickets, doorTickets, saleOverview } = await import('./tickets.ts');

const now = Date.parse('2026-11-01T12:00:00Z');
const sale = {
	concertId: 'herbst',
	seating: 'free' as const,
	capacity: 3,
	prices: [
		{ type: 'erwachsene', label: 'Erwachsene', cents: 1200 },
		{ type: 'kinder', label: 'Kinder', cents: 0 }
	],
	onlineFee: { percent: 3.5, cents: 25 },
	onlineUntil: '2026-11-21T14:00:00.000Z',
	open: true
};

beforeEach(async () => {
	store = memoryStore();
	sent.length = 0;
	await store.saveTicketSale(sale);
});

describe('publicSale', () => {
	it('shows the price, the online surcharge and the sum apart', async () => {
		const shown = await publicSale('herbst', now);
		expect(shown).toMatchObject({ state: 'open', left: 3, onlineFee: { percent: 3.5, cents: 25 } });
		expect(shown?.prices).toEqual([
			{ type: 'erwachsene', label: 'Erwachsene', cents: 1200, feeCents: 67, onlineCents: 1267 },
			{ type: 'kinder', label: 'Kinder', cents: 0, feeCents: 0, onlineCents: 0 }
		]);
		// Nothing about buyers.
		expect(JSON.stringify(shown)).not.toContain('@');
		// Who we play with, for "mit …" above the prices.
		expect(shown?.partners).toEqual([{ name: 'Kammerchor Unna', kind: 'Chor' }]);
	});

	it('is gone when another ensemble organises the concert and sells its tickets', async () => {
		await store.saveTicketSale({ ...sale, concertId: 'gast' });
		expect(await publicSale('gast', now)).toBeNull();
		expect(await reserve('gast', { name: 'Anna Bach', email: 'anna@example.org', tickets: { erwachsene: 1 } }, '1.2.3.4', now)).toMatchObject({
			ok: false,
			problem: 'noConcert'
		});
	});

	it('is gone for a sale that isn’t open, and for other events', async () => {
		await store.saveTicketSale({ ...sale, open: false });
		expect(await publicSale('herbst', now)).toBeNull();
		expect(await publicSale('probe', now)).toBeNull();
	});
});

describe('reserve', () => {
	it('places the order, charges the surcharge online and says so in the mail', async () => {
		const result = await reserve('herbst', { name: 'Anna Bach', email: 'Anna@Example.org', tickets: { erwachsene: 2, kinder: 1 } }, '1.2.3.4', now);
		expect(result).toMatchObject({ ok: true, mailed: true });
		if (!result.ok) return;
		expect(result.url).toBe(`https://noten.example.org/karte/${result.orderId}`);
		const order = await store.ticketOrder(result.orderId);
		expect(order?.tickets.map((ticket) => [ticket.cents, ticket.feeCents])).toEqual([
			[1267, 67],
			[1267, 67],
			[0, 0]
		]);
		const [mail] = sent;
		// Intl puts a no-break space before the euro sign.
		mail.text = mail.text.replace(/ /g, ' ');
		expect(mail.to).toBe('anna@example.org');
		expect(mail.text).toContain('2 × Erwachsene à 12,67 € (12,00 € + 0,67 € Online-Zuschlag) = 25,34 €');
		expect(mail.text).toContain('1 × Kinder à 0,00 € = 0,00 €');
		expect(mail.text).toContain('Darin sind 1,34 € Online-Zuschlag');
		expect(mail.text).toContain(result.url!);
		for (const ticket of order!.tickets) expect(mail.text).toContain(ticket.code);
	});

	it('refuses what doesn’t fit, what’s wrong, and a closed sale', async () => {
		expect(await reserve('herbst', { name: 'Anna', email: 'a@x.org', tickets: { erwachsene: 4 } }, 'ip', now)).toMatchObject({ ok: false, problem: 'full' });
		expect(await reserve('herbst', { name: 'Anna', email: 'nope', tickets: { erwachsene: 1 } }, 'ip', now)).toMatchObject({ ok: false, problem: 'email' });
		expect(await reserve('herbst', { name: 'Anna', email: 'a@x.org', tickets: {} }, 'ip', now)).toMatchObject({ ok: false, problem: 'empty' });
		expect(await reserve('herbst', { name: 'Anna', email: 'a@x.org', tickets: { erwachsene: 1 } }, 'ip', Date.parse(sale.onlineUntil))).toMatchObject({ ok: false, problem: 'ended' });
		expect(await reserve('probe', { name: 'Anna', email: 'a@x.org', tickets: { erwachsene: 1 } }, 'ip', now)).toMatchObject({ ok: false, status: 404 });
		expect(sent).toEqual([]);
	});

	it('limits orders per caller', async () => {
		await store.saveTicketSale({ ...sale, capacity: 100 });
		for (let i = 0; i < 5; i++) expect((await reserve('herbst', { name: 'Anna', email: `a${i}@x.org`, tickets: { kinder: 1 } }, 'same', now)).ok).toBe(true);
		expect(await reserve('herbst', { name: 'Anna', email: 'a9@x.org', tickets: { kinder: 1 } }, 'same', now)).toMatchObject({ ok: false, problem: 'rate' });
	});
});

describe('giveFreeTickets', () => {
	it('places Freikarten on top of the seats online and mails them without anything to pay', async () => {
		const result = await giveFreeTickets('herbst', { name: 'Frau Meier', email: 'Meier@Example.org', count: '4' });
		expect(result).toMatchObject({ ok: true, mailed: true });
		if (!result.ok) return;
		expect(result.url).toBe(`https://noten.example.org/karte/${result.orderId}`);
		const found = await store.ticketOrder(result.orderId);
		expect(found?.order).toMatchObject({ name: 'Frau Meier', email: 'meier@example.org', channel: 'free', status: 'paid' });
		expect(found?.tickets.map((ticket) => [ticket.type, ticket.cents, ticket.feeCents])).toEqual(Array(4).fill(['freikarte', 0, 0]));

		// More than the capacity of 3, and the website still sells all three seats.
		expect((await publicSale('herbst', now))?.left).toBe(3);
		expect((await saleOverview('herbst')).counts).toMatchObject({ sold: 0, free: 4 });
		expect((await doorTickets('herbst')).map((ticket) => ticket.type)).toEqual(Array(4).fill('Freikarte'));

		const [mail] = sent;
		expect(mail).toMatchObject({ to: 'meier@example.org', subject: 'Deine Freikarten: Herbstkonzert' });
		expect(mail.text).toContain('4 Freikarten, es gibt nichts zu bezahlen.');
		expect(mail.text).not.toContain('Abendkasse');
		expect(mail.text).not.toContain('€');
		expect(mail.text).toContain(result.url!);
		for (const ticket of found!.tickets) expect(mail.text).toContain(ticket.code);
	});

	it('goes without a mail when there is no address, and needs a sale', async () => {
		expect(await giveFreeTickets('herbst', { name: 'Herr Bach', email: '', count: 1 })).toMatchObject({ ok: true, mailed: false });
		expect(sent).toEqual([]);
		expect(await giveFreeTickets('herbst', { name: 'Herr Bach', email: '', count: 11 })).toEqual({ ok: false, problem: 'count' });
		expect(await giveFreeTickets('probe', { name: 'Herr Bach', email: '', count: 1 })).toEqual({ ok: false, problem: 'noSale' });
		await store.deleteTicketsOf('herbst');
		expect(await giveFreeTickets('herbst', { name: 'Herr Bach', email: '', count: 1 })).toEqual({ ok: false, problem: 'noSale' });
	});
});

describe('pruneTickets', () => {
	it('deletes a guest list some weeks after the concert', async () => {
		await reserve('herbst', { name: 'Anna', email: 'a@x.org', tickets: { kinder: 1 } }, 'ip', now);
		expect(await pruneTickets(Date.parse('2026-12-01T00:00:00Z'))).toBe(0);
		expect(await pruneTickets(Date.parse('2026-12-22T00:00:00Z'))).toBe(1);
		expect(await store.ticketOrders('herbst')).toEqual({ orders: [], tickets: [] });
	});
});
