/**
 * Concert tickets (docs/tickets-plan.md): an organiser opens the sale for a concert, people
 * reserve on the orchestra's website and pay at the Kasse, and phones check the codes at the
 * door. Free seating for now: a capacity, counted across everything sold. Kept by the app
 * itself (D1): nobody edits orders by hand, and many order at once.
 */

/** At most this many tickets per order. */
export const MAX_PER_ORDER = 10;
/** Guest lists and check-ins are deleted this many days after the concert. */
export const KEEP_DAYS = 30;

export type Seating = 'free';
/** free: Freikarten the organisers hand out to named guests, outside the online capacity. */
export type Channel = 'online' | 'sekretariat' | 'abendkasse' | 'free';
/** held: in someone's checkout (seat plans, later); reserved: to be paid at the Kasse. */
export type OrderStatus = 'held' | 'reserved' | 'paid' | 'cancelled';

export interface TicketPrice {
	/** The ticket's kind as stored with it, from the label: "erwachsene". */
	type: string;
	label: string;
	cents: number;
}

export interface TicketSale {
	/** The Calendar event id, as in the website's feed. */
	concertId: string;
	seating: Seating;
	capacity: number;
	prices: TicketPrice[];
	/** The online surcharge on top of each price, to cover the fees; nothing at the Kasse. */
	onlineFee: OnlineFee;
	/** Online sales end here, an ISO instant ("2026-11-21T15:00:00.000Z"). */
	onlineUntil: string;
	open: boolean;
}

export interface OnlineFee {
	/** Percent of the price, e.g. 3.5; the result is rounded up to the cent. */
	percent: number;
	/** Euro cents per ticket on top, e.g. 50. */
	cents: number;
}

export const NO_FEE: OnlineFee = { percent: 0, cents: 0 };

/** The surcharge on one ticket bought online. Free tickets stay free. */
export function onlineFeeOf(cents: number, fee: OnlineFee): number {
	if (cents <= 0) return 0;
	return Math.ceil((cents * fee.percent) / 100 - 1e-9) + fee.cents;
}

/** What one ticket of a kind costs on this channel: the price, online with the surcharge. */
export function priceOn(price: TicketPrice, fee: OnlineFee, channel: Channel): { cents: number; feeCents: number } {
	const feeCents = channel === 'online' ? onlineFeeOf(price.cents, fee) : 0;
	return { cents: price.cents + feeCents, feeCents };
}

export interface TicketOrder {
	id: string;
	concertId: string;
	name: string;
	email: string;
	channel: Channel;
	status: OrderStatus;
	/** Like SQLite's datetime('now'), UTC. */
	createdAt: string;
}

export interface Ticket {
	code: string;
	orderId: string;
	concertId: string;
	/** "F 3"; empty for free seating. */
	seat: string;
	type: string;
	/** What the ticket costs, the online surcharge included. */
	cents: number;
	/** The online surcharge in `cents`; 0 at the Kasse. */
	feeCents: number;
	/** An ISO instant, once someone was let in with it. */
	checkedInAt?: string;
	/** Who let them in. */
	checkedInBy?: string;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 128 random bits as 26 base32 letters: unguessable, and short enough for a small QR code. */
export function randomCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += BASE32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits) out += BASE32[(value << (5 - bits)) & 31];
	return out;
}

/** What a scanner or a typed code may look like; everything else is not one of ours. */
export const looksLikeCode = (text: string) => /^[A-Z2-7]{26}$/.test(text);

/** "Kinder bis 12" → "kinder-bis-12". */
export function priceType(label: string): string {
	return (
		label
			.toLowerCase()
			.replace(/ä/g, 'ae')
			.replace(/ö/g, 'oe')
			.replace(/ü/g, 'ue')
			.replace(/ß/g, 'ss')
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'karte'
	);
}

/**
 * The organiser's prices, one per line, the price last: "Erwachsene 12", "Ermäßigt 6,50",
 * "Kinder bis 12 0". Null when a line has no price or two lines name the same kind.
 */
export function parsePrices(text: string): TicketPrice[] | null {
	const prices: TicketPrice[] = [];
	for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
		const match = /^(.+?)\s*[:·–-]?\s*(\d{1,4})(?:[.,](\d{1,2}))?\s*(?:€|eur|euro)?$/i.exec(line);
		if (!match) return null;
		const label = match[1].trim();
		const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
		const type = priceType(label);
		if (prices.some((price) => price.type === type)) return null;
		prices.push({ type, label, cents });
	}
	return prices.length ? prices : null;
}

/** The prices back as the organiser typed them. */
export const pricesText = (prices: TicketPrice[]) =>
	prices.map((price) => `${price.label} ${price.cents % 100 ? (price.cents / 100).toFixed(2).replace('.', ',') : price.cents / 100}`).join('\n');

/** Not cancelled: it gets in. */
export const counts = (order: Pick<TicketOrder, 'status'>) => order.status !== 'cancelled';

/** Gets in and takes one of the seats online: Freikarten come on top of the capacity. */
export const takesSeat = (order: Pick<TicketOrder, 'status' | 'channel'>) => counts(order) && order.channel !== 'free';

/** The kind of a Freikarte as stored with it, apart from the organiser's prices. */
export const FREE_TYPE = 'freikarte';

export type SaleState = 'open' | 'closed' | 'ended' | 'soldout';

/** Whether the website may sell right now. */
export function saleState(sale: TicketSale | null, sold: number, now: number): SaleState {
	if (!sale?.open) return 'closed';
	if (Date.parse(sale.onlineUntil) <= now) return 'ended';
	if (sold >= sale.capacity) return 'soldout';
	return 'open';
}

export type OrderProblem = 'empty' | 'tooMany' | 'unknownType' | 'name' | 'email' | 'count';

/**
 * An order as tickets with what each costs on its channel, or what's wrong with it. `counts`
 * is per kind, e.g. { erwachsene: 2, kinder: 1 }.
 */
export function orderTickets(sale: TicketSale, counts: Record<string, unknown>, channel: Channel = 'online'): { type: string; cents: number; feeCents: number }[] | OrderProblem {
	const tickets: { type: string; cents: number; feeCents: number }[] = [];
	for (const [type, value] of Object.entries(counts)) {
		const n = Number(value);
		if (!Number.isInteger(n) || n < 0) return 'unknownType';
		if (!n) continue;
		const price = sale.prices.find((p) => p.type === type);
		if (!price) return 'unknownType';
		for (let i = 0; i < n; i++) tickets.push({ type, ...priceOn(price, sale.onlineFee, channel) });
		if (tickets.length > MAX_PER_ORDER) return 'tooMany';
	}
	return tickets.length ? tickets : 'empty';
}

/** A buyer's name and e-mail as stored, or what's wrong with them. Freikarten may go without an e-mail. */
export function buyer(name: unknown, email: unknown, emailRequired = true): { name: string; email: string } | OrderProblem {
	const cleanName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
	const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
	if (cleanName.length < 2 || cleanName.length > 100) return 'name';
	if (!cleanEmail && !emailRequired) return { name: cleanName, email: '' };
	if (cleanEmail.length > 200 || !/^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(cleanEmail)) return 'email';
	return { name: cleanName, email: cleanEmail };
}

/** Freikarten for one guest: the name, an optional e-mail address and how many, or what's wrong. */
export function freeGuest(name: unknown, email: unknown, count: unknown): { name: string; email: string; count: number } | OrderProblem {
	const person = buyer(name, email, false);
	if (typeof person === 'string') return person;
	const n = Number(count);
	if (!Number.isInteger(n) || n < 1 || n > MAX_PER_ORDER) return 'count';
	return { ...person, count: n };
}

/** The tickets of a Freikarten order: nothing to pay, no surcharge. */
export const freeTickets = (n: number) => Array.from({ length: n }, () => ({ type: FREE_TYPE, cents: 0, feeCents: 0 }));

export interface SaleCounts {
	/** Tickets of orders that aren't cancelled and take a seat online; Freikarten are apart. */
	sold: number;
	/** Freikarten that aren't cancelled. */
	free: number;
	checkedIn: number;
	/** Euro cents of those tickets, surcharges included. */
	cents: number;
	/** The online surcharges in `cents`, which go to the fees. */
	feeCents: number;
	byType: Record<string, number>;
}

export function saleCounts(orders: TicketOrder[], tickets: Ticket[]): SaleCounts {
	const valid = new Map(orders.filter(counts).map((order) => [order.id, order]));
	const result: SaleCounts = { sold: 0, free: 0, checkedIn: 0, cents: 0, feeCents: 0, byType: {} };
	for (const ticket of tickets) {
		const order = valid.get(ticket.orderId);
		if (!order) continue;
		if (takesSeat(order)) result.sold++;
		else result.free++;
		result.cents += ticket.cents;
		result.feeCents += ticket.feeCents;
		result.byType[ticket.type] = (result.byType[ticket.type] ?? 0) + 1;
		if (ticket.checkedInAt) result.checkedIn++;
	}
	return result;
}

/** One entry of the list a phone at the door keeps: everything it needs to decide offline. */
export interface DoorTicket {
	code: string;
	name: string;
	type: string;
	seat: string;
	checkedInAt?: string;
}

/** The valid tickets of a concert for the door, sorted by name for the search. */
export function doorList(orders: TicketOrder[], tickets: Ticket[], locale = 'de'): DoorTicket[] {
	const byId = new Map(orders.filter(counts).map((order) => [order.id, order]));
	return tickets
		.flatMap((ticket) => {
			const order = byId.get(ticket.orderId);
			if (!order) return [];
			return [{ code: ticket.code, name: order.name, type: ticket.type, seat: ticket.seat, ...(ticket.checkedInAt ? { checkedInAt: ticket.checkedInAt } : {}) }];
		})
		.sort((a, b) => a.name.localeCompare(b.name, locale) || a.code.localeCompare(b.code));
}

export type Admission = { ok: true; ticket: DoorTicket } | { ok: false; reason: 'used'; ticket: DoorTicket } | { ok: false; reason: 'unknown' };

/** What the door says to a scanned code, from the list it keeps. */
export function admit(list: Map<string, DoorTicket>, code: string): Admission {
	const ticket = list.get(code.trim().toUpperCase());
	if (!ticket) return { ok: false, reason: 'unknown' };
	if (ticket.checkedInAt) return { ok: false, reason: 'used', ticket };
	return { ok: true, ticket };
}

/** Name search at the door: every word somewhere in the name, without case or accents. */
export function searchDoor(list: DoorTicket[], query: string): DoorTicket[] {
	const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
	const words = fold(query).split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	return list.filter((ticket) => words.every((word) => fold(ticket.name).includes(word)));
}

/** "12,67 €" in the deployment's language. */
export const euro = (cents: number, locale = 'de-DE') => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);

/** An instant as a datetime-local field's value in the orchestra's time zone: "2026-11-21T15:00". */
export function localInput(iso: string, timeZone: string): string {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
			.formatToParts(new Date(iso))
			.map((part) => [part.type, part.value])
	);
	return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** A datetime-local field's value, meant in the orchestra's time zone, as an ISO instant; null if it isn't one. */
export function fromLocalInput(text: string, timeZone: string): string | null {
	const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(text.trim());
	if (!match) return null;
	const wall = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]);
	let guess = wall;
	// Twice, so a guess on the other side of a clock change settles.
	for (let i = 0; i < 2; i++) {
		const seen = Date.parse(`${localInput(new Date(guess).toISOString(), timeZone)}:00Z`);
		guess += wall - seen;
	}
	return Number.isNaN(guess) ? null : new Date(guess).toISOString();
}
