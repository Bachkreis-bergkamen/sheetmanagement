import { error, fail } from '@sveltejs/kit';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { getStore } from '#lib/server/db/index.ts';
import { requireFeature } from '#lib/server/env.ts';
import { getLibrary } from '#lib/server/library.ts';
import { giveFreeTickets, labelOf, publicPrices, saleOverview } from '#lib/server/tickets.ts';
import { euro, fromLocalInput, localInput, NO_FEE, onlineFeeOf, parsePrices, pricesText, saleCounts, type TicketSale } from '#lib/tickets/tickets.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * A concert's ticket sale for organisers (docs/tickets-plan.md §4.1): open it, set the seats,
 * the prices and the online surcharge, see who reserved, cancel, and mark orders paid. Freikarten
 * for named guests come on top of the seats online.
 */

const RIGHT = 'karten.verwalten';
/** Online sales end two hours before the concert unless the organiser says otherwise. */
const DEFAULT_LEAD_HOURS = 2;
const money = (cents: number) => euro(cents, config.locale.startsWith('de') ? 'de-DE' : config.locale);

async function concertOf(id: string) {
	const library = await getLibrary();
	if (!library.schedule.ok) error(503, t.messages.calendarUnavailable);
	const event = library.schedule.byId.get(id);
	if (!event) error(404, t.messages.noEvent);
	if (event.type !== 'konzert') error(404, t.tickets.notAConcert);
	// Another ensemble organises it and sells the tickets ("Veranstalter"): the website can't sell here.
	return { ...event, organizer: library.concertsById.get(id)?.organizer?.name };
}

export const load: PageServerLoad = async ({ params, locals }) => {
	requireFeature('tickets');
	requireRight(locals, RIGHT);
	const event = await concertOf(params.id);
	const sale = await getStore().ticketSale(event.id);
	const overview = await saleOverview(event.id);
	const until = sale?.onlineUntil ?? new Date(Date.parse(event.start) - DEFAULT_LEAD_HOURS * 3600_000).toISOString();
	// The first price as the example of what the surcharge does.
	const example = sale?.prices.find((price) => price.cents > 0);
	return {
		concert: { id: event.id, title: event.displayTitle, date: event.date, past: event.past, organizer: event.organizer },
		values: {
			open: sale?.open ?? false,
			capacity: String(sale?.capacity ?? ''),
			prices: sale ? pricesText(sale.prices) : '',
			feePercent: String(sale?.onlineFee.percent ?? 0).replace('.', config.locale.startsWith('de') ? ',' : '.'),
			feeCents: ((sale?.onlineFee.cents ?? 0) / 100).toFixed(2).replace('.', config.locale.startsWith('de') ? ',' : '.'),
			onlineUntil: localInput(until, config.timeZone)
		},
		prices: sale ? publicPrices(sale).map((price) => ({ ...price, text: { cents: money(price.cents), fee: money(price.feeCents), online: money(price.onlineCents) } })) : [],
		example:
			example && sale && onlineFeeOf(example.cents, sale.onlineFee)
				? t.tickets.setup.feeExample(money(example.cents), money(onlineFeeOf(example.cents, sale.onlineFee)), money(example.cents + onlineFeeOf(example.cents, sale.onlineFee)))
				: sale
					? t.tickets.setup.noFee
					: null,
		counts: { ...overview.counts, left: sale ? Math.max(0, sale.capacity - overview.counts.sold) : 0, takings: money(overview.counts.cents), fees: money(overview.counts.feeCents) },
		orders: overview.orders.map((order) => ({
			id: order.id,
			name: order.name,
			email: order.email,
			status: order.status,
			free: order.channel === 'free',
			createdAt: order.createdAt,
			tickets: order.tickets.length,
			kinds: [...new Set(order.tickets.map((ticket) => labelOf(sale, ticket.type)))].join(', '),
			amount: money(order.tickets.reduce((sum, ticket) => sum + ticket.cents, 0)),
			checkedIn: order.tickets.filter((ticket) => ticket.checkedInAt).length
		}))
	};
};

/** "3,5" or "3.5" as a number; NaN for anything else. */
const decimal = (text: FormDataEntryValue | null) => (String(text ?? '').trim() === '' ? 0 : Number(String(text).trim().replace(',', '.')));

export const actions: Actions = {
	save: async ({ params, request, locals }) => {
		requireFeature('tickets');
		requireRight(locals, RIGHT);
		const event = await concertOf(params.id);
		const data = await request.formData();
		const values = Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value)]));
		const prices = parsePrices(values.prices ?? '');
		if (!prices) return fail(400, { message: t.tickets.setup.badPrices, values });
		const capacity = Number(values.capacity);
		if (!Number.isInteger(capacity) || capacity < 1 || capacity > 5000) return fail(400, { message: t.tickets.setup.badCapacity, values });
		const percent = decimal(data.get('feePercent'));
		const fixed = Math.round(decimal(data.get('feeCents')) * 100);
		if (!(percent >= 0 && percent <= 20) || !(fixed >= 0 && fixed <= 500)) return fail(400, { message: t.tickets.setup.badFee, values });
		const onlineUntil = fromLocalInput(values.onlineUntil ?? '', config.timeZone);
		if (!onlineUntil || Date.parse(onlineUntil) > Date.parse(event.start)) return fail(400, { message: t.tickets.setup.badUntil, values });
		const sale: TicketSale = {
			concertId: event.id,
			seating: 'free',
			capacity,
			prices,
			onlineFee: percent || fixed ? { percent: Math.round(percent * 100) / 100, cents: fixed } : NO_FEE,
			onlineUntil,
			open: data.has('open')
		};
		await getStore().saveTicketSale(sale);
		return { saved: true };
	},

	free: async ({ params, request, locals, url }) => {
		requireFeature('tickets');
		requireRight(locals, RIGHT);
		const event = await concertOf(params.id);
		const data = await request.formData();
		const fields = { name: data.get('name'), email: data.get('email'), count: data.get('count') };
		const result = await giveFreeTickets(event.id, fields);
		if (!result.ok) {
			const freeValues = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value ?? '')]));
			return fail(400, { freeMessage: result.problem === 'noSale' ? t.tickets.free.noSale : t.tickets.problems[result.problem], freeValues });
		}
		const email = String(fields.email ?? '').trim();
		return {
			free: {
				given: t.tickets.free.given(Number(fields.count), String(fields.name).trim().replace(/\s+/g, ' ')),
				mail: email ? (result.mailed ? t.tickets.free.mailed(email) : t.tickets.free.notMailed) : null,
				// The organiser is on noten itself, so its own address does when no mail account knows it.
				link: result.url ?? new URL(result.path, url).href
			}
		};
	},

	status: async ({ params, request, locals }) => {
		requireFeature('tickets');
		requireRight(locals, RIGHT);
		const event = await concertOf(params.id);
		const data = await request.formData();
		const id = String(data.get('order') ?? '');
		const status = String(data.get('status') ?? '');
		if (status !== 'cancelled' && status !== 'reserved' && status !== 'paid') return fail(400, {});
		const store = getStore();
		const found = await store.ticketOrder(id);
		if (!found || found.order.concertId !== event.id) error(404, t.error.notFound);
		await store.setTicketOrderStatus(id, status);
		// Restoring a cancelled order must still fit; if someone took the seats meanwhile, it stays cancelled.
		if (found.order.status === 'cancelled' && status !== 'cancelled') {
			const [sale, all] = await Promise.all([store.ticketSale(event.id), store.ticketOrders(event.id)]);
			if (sale && saleCounts(all.orders, all.tickets).sold > sale.capacity) {
				await store.setTicketOrderStatus(id, 'cancelled');
				return fail(409, { conflict: t.tickets.orders.conflict });
			}
		}
		return { changed: true };
	}
};
