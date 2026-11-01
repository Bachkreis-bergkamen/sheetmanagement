import { takesSeat, type Ticket, type TicketOrder, type TicketSale } from '#lib/tickets/tickets.ts';
import type { Store } from './types.ts';

/** Concert tickets without D1 (demo, tests): the same rules as tickets-sql.ts, kept in memory. */

type TicketMethods = Pick<
	Store,
	'ticketSale' | 'ticketSales' | 'saveTicketSale' | 'placeTicketOrder' | 'ticketOrder' | 'ticketOrders' | 'setTicketOrderStatus' | 'checkInTickets' | 'deleteTicketsOf'
>;

const sqlNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export function memoryTickets(): TicketMethods {
	const sales = new Map<string, TicketSale>();
	const orders = new Map<string, TicketOrder>();
	const tickets = new Map<string, Ticket>();
	const copy = <T>(value: T): T => structuredClone(value);

	return {
		async ticketSale(concertId) {
			const sale = sales.get(concertId);
			return sale ? copy(sale) : null;
		},
		async ticketSales() {
			return [...sales.values()].sort((a, b) => a.concertId.localeCompare(b.concertId)).map(copy);
		},
		async saveTicketSale(sale) {
			sales.set(sale.concertId, copy(sale));
		},
		async placeTicketOrder(order, list, capacity) {
			if (orders.has(order.id) || list.some((ticket) => tickets.has(ticket.code))) throw new Error('UNIQUE constraint failed');
			const valid = new Set([...orders.values()].filter((o) => o.concertId === order.concertId && takesSeat(o)).map((o) => o.id));
			const sold = [...tickets.values()].filter((ticket) => valid.has(ticket.orderId)).length;
			if (capacity !== null && sold + list.length > capacity) return false;
			orders.set(order.id, { ...copy(order), createdAt: sqlNow() });
			for (const ticket of list) tickets.set(ticket.code, copy(ticket));
			return true;
		},
		async ticketOrder(id) {
			const order = orders.get(id);
			if (!order) return null;
			return { order: copy(order), tickets: [...tickets.values()].filter((ticket) => ticket.orderId === id).map(copy) };
		},
		async ticketOrders(concertId) {
			return {
				orders: [...orders.values()].filter((order) => order.concertId === concertId).map(copy),
				tickets: [...tickets.values()].filter((ticket) => ticket.concertId === concertId).map(copy)
			};
		},
		async setTicketOrderStatus(id, status) {
			const order = orders.get(id);
			if (order) order.status = status;
		},
		async checkInTickets(concertId, entries) {
			for (const entry of entries) {
				const ticket = tickets.get(entry.code);
				if (ticket?.concertId === concertId && !ticket.checkedInAt) Object.assign(ticket, { checkedInAt: entry.at, checkedInBy: entry.by });
			}
		},
		async deleteTicketsOf(concertId) {
			for (const [code, ticket] of tickets) if (ticket.concertId === concertId) tickets.delete(code);
			for (const [id, order] of orders) if (order.concertId === concertId) orders.delete(id);
			sales.delete(concertId);
		}
	};
}
