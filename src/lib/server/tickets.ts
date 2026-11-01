import { config } from '#lib/config/index.ts';
import type { ShownEvent } from '#lib/events/schedule.ts';
import { t } from '#lib/i18n/index.ts';
import {
	buyer,
	counts,
	doorList,
	euro,
	FREE_TYPE,
	freeGuest,
	freeTickets,
	KEEP_DAYS,
	MAX_PER_ORDER,
	orderTickets,
	priceOn,
	randomCode,
	saleCounts,
	saleState,
	type OrderProblem,
	type SaleState,
	type Ticket,
	type TicketOrder,
	type TicketSale
} from '#lib/tickets/tickets.ts';
import { getStore } from './db/index.ts';
import { orchestra } from './env.ts';
import { getLibrary, type Library } from './library.ts';
import { mailAccount, sendMail } from './mail/index.ts';

/**
 * Concert tickets on the server (docs/tickets-plan.md): what the website may show and sell,
 * reservations with their confirmation mail, and the list the phones at the door keep.
 * Online tickets cost the price plus a surcharge for the fees, always shown apart.
 */

/** Orders per caller and per buyer, so nobody books a hall empty with fake names. */
const ORDERS_PER_HOUR = 5;
/** All online orders of one concert per hour; far above a school concert's real rush. */
const CONCERT_ORDERS_PER_HOUR = 300;

const locale = () => (config.locale.startsWith('de') ? 'de-DE' : config.locale);

/** An upcoming concert of the calendar, or undefined. */
export function upcomingConcert(library: Library, id: string): ShownEvent | undefined {
	const event = library.schedule.ok ? library.schedule.byId.get(id) : undefined;
	return event?.type === 'konzert' && !event.past ? event : undefined;
}

/** A price as the website shows it: the Kasse price, the online surcharge and the sum, apart. */
export interface PublicPrice {
	type: string;
	label: string;
	/** At the Sekretariat and the Abendkasse. */
	cents: number;
	/** The online surcharge on top. */
	feeCents: number;
	/** What a ticket costs online: cents + feeCents. */
	onlineCents: number;
}

/** Everything the website needs to sell one concert's tickets; nothing about buyers. */
export interface PublicSale {
	concertId: string;
	title: string;
	dateText: string;
	start: string;
	location?: string;
	state: SaleState;
	seating: 'free';
	/** Seats left, counted with everything sold elsewhere. */
	left: number;
	maxPerOrder: number;
	onlineUntil: string;
	prices: PublicPrice[];
	/** How the surcharge is made up, for the sentence under the prices. */
	onlineFee: { percent: number; cents: number };
}

async function soldFor(concertId: string): Promise<{ orders: TicketOrder[]; tickets: Ticket[]; sold: number }> {
	const { orders, tickets } = await getStore().ticketOrders(concertId);
	return { orders, tickets, sold: saleCounts(orders, tickets).sold };
}

export function publicPrices(sale: TicketSale): PublicPrice[] {
	return sale.prices.map((price) => {
		const online = priceOn(price, sale.onlineFee, 'online');
		return { type: price.type, label: price.label, cents: price.cents, feeCents: online.feeCents, onlineCents: online.cents };
	});
}

/** The sale of an upcoming concert for the website; null when it has none or isn't upcoming. */
export async function publicSale(concertId: string, now = Date.now()): Promise<PublicSale | null> {
	const [library, sale] = await Promise.all([getLibrary(), getStore().ticketSale(concertId)]);
	const event = upcomingConcert(library, concertId);
	if (!event || !sale?.open) return null;
	const { sold } = await soldFor(concertId);
	return {
		concertId,
		title: event.displayTitle,
		dateText: event.date.long,
		start: event.start,
		...(event.location ? { location: event.location } : {}),
		state: saleState(sale, sold, now),
		seating: sale.seating,
		left: Math.max(0, sale.capacity - sold),
		maxPerOrder: MAX_PER_ORDER,
		onlineUntil: sale.onlineUntil,
		prices: publicPrices(sale),
		onlineFee: sale.onlineFee
	};
}

/** The concerts the website may link to a sale: open and upcoming. */
export async function openSales(): Promise<Set<string>> {
	const sales = await getStore()
		.ticketSales()
		.catch(() => []);
	return new Set(sales.filter((sale) => sale.open && Date.parse(sale.onlineUntil) > Date.now()).map((sale) => sale.concertId));
}

export type ReserveResult =
	| { ok: true; orderId: string; path: string; url: string | null; mailed: boolean }
	| { ok: false; status: number; problem: OrderProblem | SaleState | 'rate' | 'full' | 'noConcert' };

/**
 * A reservation from the website: checked, placed if it still fits, and confirmed by mail with
 * a link to the tickets. Paid at the Kasse; the price includes the online surcharge.
 */
export async function reserve(concertId: string, body: Record<string, unknown>, caller: string, now = Date.now()): Promise<ReserveResult> {
	const store = getStore();
	const [library, sale] = await Promise.all([getLibrary(), store.ticketSale(concertId)]);
	const event = upcomingConcert(library, concertId);
	if (!event || !sale) return { ok: false, status: 404, problem: 'noConcert' };

	const person = buyer(body.name, body.email);
	if (typeof person === 'string') return { ok: false, status: 400, problem: person };
	const wanted = orderTickets(sale, (body.tickets && typeof body.tickets === 'object' ? body.tickets : {}) as Record<string, unknown>, 'online');
	if (typeof wanted === 'string') return { ok: false, status: 400, problem: wanted };

	const { sold } = await soldFor(concertId);
	const state = saleState(sale, sold, now);
	if (state !== 'open') return { ok: false, status: 409, problem: state };

	const [byCaller, byBuyer, byConcert] = await Promise.all([
		store.hit(`tickets:ip:${caller}`, 60),
		store.hit(`tickets:mail:${person.email}`, 60),
		store.hit(`tickets:concert:${concertId}`, 60)
	]);
	if (byCaller > ORDERS_PER_HOUR || byBuyer > ORDERS_PER_HOUR || byConcert > CONCERT_ORDERS_PER_HOUR) return { ok: false, status: 429, problem: 'rate' };

	const order: TicketOrder = { id: randomCode().toLowerCase(), concertId, ...person, channel: 'online', status: 'reserved', createdAt: '' };
	const tickets: Ticket[] = wanted.map((ticket) => ({ code: randomCode(), orderId: order.id, concertId, seat: '', ...ticket }));
	if (!(await store.placeTicketOrder(order, tickets, sale.capacity))) return { ok: false, status: 409, problem: 'full' };

	// The address of the tickets: whole when noten knows its own (from the mail account), else the
	// path for the website to put noten's address in front of.
	const path = `/karte/${order.id}`;
	const origin = (await mailAccount())?.origin ?? null;
	const url = origin ? `${origin}${path}` : null;
	const mailed = await sendMail(person.email, t.tickets.mail.subject(event.displayTitle), confirmationText(event, sale, order, tickets, url)).catch(() => false);
	return { ok: true, orderId: order.id, path, url, mailed };
}

/** The label of a ticket's kind: from the organiser's prices, or "Freikarte". */
export function labelOf(sale: TicketSale | null, type: string): string {
	return sale?.prices.find((price) => price.type === type)?.label ?? (type === FREE_TYPE ? t.tickets.free.label : type);
}

export type FreeResult = { ok: true; orderId: string; path: string; url: string | null; mailed: boolean } | { ok: false; problem: OrderProblem | 'noSale' };

/**
 * Freikarten from the organisers for a named guest: an order on its own channel, nothing to pay,
 * on top of the seats online. With an e-mail address the guest gets the link by mail; without
 * one the organiser passes it on.
 */
export async function giveFreeTickets(concertId: string, fields: { name: unknown; email: unknown; count: unknown }): Promise<FreeResult> {
	const store = getStore();
	const [library, sale] = await Promise.all([getLibrary(), store.ticketSale(concertId)]);
	const event = upcomingConcert(library, concertId);
	if (!event || !sale) return { ok: false, problem: 'noSale' };
	const guest = freeGuest(fields.name, fields.email, fields.count);
	if (typeof guest === 'string') return { ok: false, problem: guest };

	const order: TicketOrder = { id: randomCode().toLowerCase(), concertId, name: guest.name, email: guest.email, channel: 'free', status: 'paid', createdAt: '' };
	const tickets: Ticket[] = freeTickets(guest.count).map((ticket) => ({ code: randomCode(), orderId: order.id, concertId, seat: '', ...ticket }));
	await store.placeTicketOrder(order, tickets, null);

	const path = `/karte/${order.id}`;
	const origin = (await mailAccount())?.origin ?? null;
	const url = origin ? `${origin}${path}` : null;
	const mailed = guest.email ? await sendMail(guest.email, t.tickets.free.subject(event.displayTitle), confirmationText(event, sale, order, tickets, url)).catch(() => false) : false;
	return { ok: true, orderId: order.id, path, url, mailed };
}

/** One line per kind: "2 × Erwachsene à 12,67 € (12,00 € + 0,67 € Online-Zuschlag) = 25,34 €". */
export function orderLines(sale: TicketSale, tickets: Ticket[]) {
	const lines = new Map<string, { label: string; n: number; cents: number; feeCents: number }>();
	for (const ticket of tickets) {
		const line = lines.get(ticket.type) ?? { label: labelOf(sale, ticket.type), n: 0, cents: ticket.cents, feeCents: ticket.feeCents };
		line.n++;
		lines.set(ticket.type, line);
	}
	return [...lines.values()];
}

export function confirmationText(event: ShownEvent, sale: TicketSale, order: TicketOrder, tickets: Ticket[], url: string | null): string {
	const m = t.tickets.mail;
	const money = (cents: number) => euro(cents, locale());
	const total = tickets.reduce((sum, ticket) => sum + ticket.cents, 0);
	const fees = tickets.reduce((sum, ticket) => sum + ticket.feeCents, 0);
	const free = order.channel === 'free';
	// Freikarten: no prices and nothing to pay, just how many.
	const bill = free
		? [t.tickets.free.mailLine(tickets.length)]
		: [
				...orderLines(sale, tickets).map((line) =>
					m.line(line.n, line.label, money(line.cents), line.feeCents ? m.lineFee(money(line.cents - line.feeCents), money(line.feeCents)) : '', money(line.n * line.cents))
				),
				m.total(money(total)),
				...(fees ? [m.feeExplained(money(fees))] : []),
				'',
				m.payAtDoor
			];
	return [
		m.hello(order.name),
		'',
		(free ? t.tickets.free.mailReserved : m.reserved)(event.displayTitle, event.date.long, event.date.time),
		...(event.location ? [event.location] : []),
		'',
		...bill,
		'',
		...(url ? [m.link, url] : []),
		m.codes,
		...tickets.map((ticket, i) => `${i + 1}. ${ticket.code}`),
		'',
		m.cancel(orchestra().name)
	].join('\n');
}

/** The organiser's overview: counts and every order, cancelled ones last. */
export async function saleOverview(concertId: string) {
	const { orders, tickets } = await getStore().ticketOrders(concertId);
	const byOrder = new Map<string, Ticket[]>();
	for (const ticket of tickets) byOrder.set(ticket.orderId, [...(byOrder.get(ticket.orderId) ?? []), ticket]);
	return {
		counts: saleCounts(orders, tickets),
		orders: orders
			.map((order) => ({ ...order, tickets: byOrder.get(order.id) ?? [] }))
			.sort((a, b) => Number(!counts(a)) - Number(!counts(b)) || a.name.localeCompare(b.name, config.locale))
	};
}

/** The door's list: every valid ticket with the buyer's name and its kind's label, for checking offline. */
export async function doorTickets(concertId: string) {
	const [{ orders, tickets }, sale] = await Promise.all([getStore().ticketOrders(concertId), getStore().ticketSale(concertId)]);
	return doorList(orders, tickets, config.locale).map((ticket) => ({ ...ticket, type: labelOf(sale, ticket.type) }));
}

/**
 * Guest lists and check-ins don't outlive the concert by long (docs/tickets-plan.md §5): a
 * sale whose concert ended KEEP_DAYS ago, or is gone from the calendar for that long, goes.
 */
export async function pruneTickets(now = Date.now()): Promise<number> {
	const store = getStore();
	const [library, sales] = await Promise.all([getLibrary(), store.ticketSales()]);
	if (!library.schedule.ok) return 0;
	const cutoff = now - KEEP_DAYS * 24 * 60 * 60 * 1000;
	let pruned = 0;
	for (const sale of sales) {
		const event = library.schedule.byId.get(sale.concertId);
		const end = event ? Date.parse(event.end) : Date.parse(sale.onlineUntil);
		if (end < cutoff) {
			await store.deleteTicketsOf(sale.concertId);
			pruned++;
		}
	}
	return pruned;
}
