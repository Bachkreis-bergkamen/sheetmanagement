import { error } from '@sveltejs/kit';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { getStore } from '#lib/server/db/index.ts';
import { requireFeature } from '#lib/server/env.ts';
import { getLibrary } from '#lib/server/library.ts';
import { labelOf, orderLines } from '#lib/server/tickets.ts';
import { qrPath } from '#lib/tickets/qr.ts';
import { euro } from '#lib/tickets/tickets.ts';
import type { PageServerLoad } from './$types';

/**
 * A buyer's tickets, linked from the confirmation mail (docs/tickets-plan.md §4.5): one QR code
 * per ticket, and the price with the online surcharge apart. The order's long random id in the
 * address is the proof; there is no sign-in for buyers.
 */
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	requireFeature('tickets');
	const found = await getStore().ticketOrder(params.order.toLowerCase());
	if (!found) error(404, t.error.notFound);
	const { order, tickets } = found;
	const [library, sale] = await Promise.all([getLibrary(), getStore().ticketSale(order.concertId)]);
	const event = library.schedule.ok ? library.schedule.byId.get(order.concertId) : undefined;
	const money = (cents: number) => euro(cents, config.locale.startsWith('de') ? 'de-DE' : config.locale);
	// Nobody else's business, and not for search engines or shared caches.
	setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	return {
		concert: event ? { title: event.displayTitle, date: event.date.long, time: event.date.time, location: event.location } : null,
		name: order.name,
		cancelled: order.status === 'cancelled',
		free: order.channel === 'free',
		tickets: tickets.map((ticket) => ({
			code: ticket.code,
			label: labelOf(sale, ticket.type),
			seat: ticket.seat,
			price: order.channel === 'free' ? '' : ticket.feeCents ? t.tickets.ticket.priceWithFee(money(ticket.cents), money(ticket.cents - ticket.feeCents), money(ticket.feeCents)) : money(ticket.cents),
			qr: qrPath(ticket.code)
		})),
		lines: sale
			? orderLines(sale, tickets).map((line) => ({
					text: t.tickets.mail.line(
						line.n,
						line.label,
						money(line.cents),
						line.feeCents ? t.tickets.mail.lineFee(money(line.cents - line.feeCents), money(line.feeCents)) : '',
						money(line.n * line.cents)
					)
				}))
			: [],
		total: money(tickets.reduce((sum, ticket) => sum + ticket.cents, 0)),
		hasFee: tickets.some((ticket) => ticket.feeCents > 0)
	};
};
