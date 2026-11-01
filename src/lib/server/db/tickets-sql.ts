import type { Ticket, TicketOrder, TicketSale } from '#lib/tickets/tickets.ts';
import type { D1 } from './sql.ts';
import type { Store } from './types.ts';

/**
 * Concert tickets in D1 (docs/tickets-plan.md, migration 0010). An order and its tickets land
 * in one batch, and only while they fit under the capacity: D1 runs one batch at a time, so two
 * buyers can't both get the last seats, whichever Worker answers them.
 */

type TicketMethods = Pick<
	Store,
	'ticketSale' | 'ticketSales' | 'saveTicketSale' | 'placeTicketOrder' | 'ticketOrder' | 'ticketOrders' | 'setTicketOrderStatus' | 'checkInTickets' | 'deleteTicketsOf'
>;

type SaleRow = { concert_id: string; seating: string; capacity: number; prices: string; fee_percent: number; fee_cents: number; online_until: string; open: number };
type OrderRow = { id: string; concert_id: string; name: string; email: string | null; channel: string; status: string; created_at: string };
type TicketRow = { code: string; order_id: string; concert_id: string; seat: string | null; type: string; cents: number; fee_cents: number; checked_in_at: string | null; checked_in_by: string | null };

const saleFrom = (row: SaleRow): TicketSale => ({
	concertId: row.concert_id,
	seating: 'free',
	capacity: row.capacity,
	prices: JSON.parse(row.prices),
	onlineFee: { percent: row.fee_percent, cents: row.fee_cents },
	onlineUntil: row.online_until,
	open: !!row.open
});

const orderFrom = (row: OrderRow): TicketOrder => ({
	id: row.id,
	concertId: row.concert_id,
	name: row.name,
	email: row.email ?? '',
	channel: row.channel as TicketOrder['channel'],
	status: row.status as TicketOrder['status'],
	createdAt: row.created_at
});

const ticketFrom = (row: TicketRow): Ticket => ({
	code: row.code,
	orderId: row.order_id,
	concertId: row.concert_id,
	seat: row.seat ?? '',
	type: row.type,
	cents: row.cents,
	feeCents: row.fee_cents,
	...(row.checked_in_at ? { checkedInAt: row.checked_in_at } : {}),
	...(row.checked_in_by ? { checkedInBy: row.checked_in_by } : {})
});

const TICKET_COLUMNS = 'code, order_id, concert_id, seat, type, cents, fee_cents, checked_in_at, checked_in_by';

export function sqlTickets(db: D1, schema: () => Promise<unknown>): TicketMethods {
	const all = async <T>(sql: string, ...values: unknown[]) => (await schema(), (await db.prepare(sql).bind(...values).all<T>()).results);
	const run = async (sql: string, ...values: unknown[]) => (await schema(), await db.prepare(sql).bind(...values).run());

	return {
		async ticketSale(concertId) {
			const [row] = await all<SaleRow>('SELECT * FROM ticket_sales WHERE concert_id = ?', concertId);
			return row ? saleFrom(row) : null;
		},
		async ticketSales() {
			return (await all<SaleRow>('SELECT * FROM ticket_sales ORDER BY concert_id')).map(saleFrom);
		},
		async saveTicketSale(sale) {
			await run(
				`INSERT INTO ticket_sales (concert_id, seating, capacity, prices, fee_percent, fee_cents, online_until, open) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT (concert_id) DO UPDATE SET seating = excluded.seating, capacity = excluded.capacity, prices = excluded.prices,
					fee_percent = excluded.fee_percent, fee_cents = excluded.fee_cents, online_until = excluded.online_until, open = excluded.open, updated_at = datetime('now')`,
				sale.concertId,
				sale.seating,
				sale.capacity,
				JSON.stringify(sale.prices),
				sale.onlineFee.percent,
				sale.onlineFee.cents,
				sale.onlineUntil,
				sale.open ? 1 : 0
			);
		},
		async placeTicketOrder(order, tickets, capacity) {
			await schema();
			const rows = tickets.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
			const values = tickets.flatMap((ticket) => [ticket.code, ticket.orderId, ticket.concertId, ticket.seat || null, ticket.type, ticket.cents, ticket.feeCents]);
			try {
				await db.batch([
					db
						.prepare('INSERT INTO ticket_orders (id, concert_id, name, email, channel, status) VALUES (?, ?, ?, ?, ?, ?)')
						.bind(order.id, order.concertId, order.name, order.email || null, order.channel, order.status),
					// All tickets or none, and only while they fit: the count is read in the same statement.
					// Freikarten don't take seats online, and a null capacity places an order regardless.
					db
						.prepare(
							`INSERT INTO tickets (code, order_id, concert_id, seat, type, cents, fee_cents)
							 SELECT * FROM (VALUES ${rows})
							 WHERE ? IS NULL OR (SELECT COUNT(*) FROM tickets t JOIN ticket_orders o ON o.id = t.order_id
							        WHERE t.concert_id = ? AND o.status != 'cancelled' AND o.channel != 'free') + ? <= ?`
						)
						.bind(...values, capacity, order.concertId, tickets.length, capacity),
					// No tickets inserted: the guard's check fails and the order goes too.
					db.prepare('INSERT INTO write_guard (changed) VALUES (changes())'),
					db.prepare('DELETE FROM write_guard')
				]);
				return true;
			} catch (cause) {
				if (/CHECK constraint failed/i.test(String(cause instanceof Error ? cause.message : cause))) return false;
				throw cause;
			}
		},
		async ticketOrder(id) {
			const [row] = await all<OrderRow>('SELECT * FROM ticket_orders WHERE id = ?', id);
			if (!row) return null;
			const tickets = await all<TicketRow>(`SELECT ${TICKET_COLUMNS} FROM tickets WHERE order_id = ? ORDER BY rowid`, id);
			return { order: orderFrom(row), tickets: tickets.map(ticketFrom) };
		},
		async ticketOrders(concertId) {
			const [orders, tickets] = await Promise.all([
				all<OrderRow>('SELECT * FROM ticket_orders WHERE concert_id = ? ORDER BY created_at, rowid', concertId),
				all<TicketRow>(`SELECT ${TICKET_COLUMNS} FROM tickets WHERE concert_id = ? ORDER BY rowid`, concertId)
			]);
			return { orders: orders.map(orderFrom), tickets: tickets.map(ticketFrom) };
		},
		async setTicketOrderStatus(id, status) {
			await run('UPDATE ticket_orders SET status = ? WHERE id = ?', status, id);
		},
		async checkInTickets(concertId, entries) {
			if (!entries.length) return;
			await schema();
			const update = 'UPDATE tickets SET checked_in_at = ?, checked_in_by = ? WHERE code = ? AND concert_id = ? AND checked_in_at IS NULL';
			for (let i = 0; i < entries.length; i += 50) {
				await db.batch(entries.slice(i, i + 50).map((entry) => db.prepare(update).bind(entry.at, entry.by, entry.code, concertId)));
			}
		},
		async deleteTicketsOf(concertId) {
			await schema();
			await db.batch([
				db.prepare('DELETE FROM tickets WHERE concert_id = ?').bind(concertId),
				db.prepare('DELETE FROM ticket_orders WHERE concert_id = ?').bind(concertId),
				db.prepare('DELETE FROM ticket_sales WHERE concert_id = ?').bind(concertId)
			]);
		}
	};
}
