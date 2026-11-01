import { error } from '@sveltejs/kit';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { toCsv } from '#lib/repertoire/music-report.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { getStore } from '#lib/server/db/index.ts';
import { requireFeature } from '#lib/server/env.ts';
import { labelOf, saleOverview } from '#lib/server/tickets.ts';
import { euro } from '#lib/tickets/tickets.ts';
import type { RequestHandler } from './$types';

/** The guest list as a CSV file, for the Abendkasse when the phones fail (docs/tickets-plan.md §4.1). */
export const GET: RequestHandler = async ({ params, locals }) => {
	requireFeature('tickets');
	requireRight(locals, 'karten.verwalten');
	const sale = await getStore().ticketSale(params.id);
	if (!sale) error(404, t.error.notFound);
	const { orders } = await saleOverview(params.id);
	const money = (cents: number) => euro(cents, config.locale.startsWith('de') ? 'de-DE' : config.locale);
	const status = { reserved: '', held: '', paid: t.tickets.orders.paid, cancelled: t.tickets.orders.cancelled };
	const rows = orders.map((order) => [
		order.name,
		order.email,
		String(order.tickets.length),
		order.tickets.map((ticket) => labelOf(sale, ticket.type)).join(', '),
		money(order.tickets.reduce((sum, ticket) => sum + ticket.cents, 0)),
		money(order.tickets.reduce((sum, ticket) => sum + ticket.feeCents, 0)),
		order.channel === 'free' && order.status !== 'cancelled' ? t.tickets.orders.free : status[order.status],
		order.createdAt
	]);
	return new Response(toCsv([t.tickets.orders.csvHeader(), ...rows]), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="gaeste.csv"',
			'cache-control': 'private, no-store'
		}
	});
};
