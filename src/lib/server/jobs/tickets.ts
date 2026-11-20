import * as t from '#lib/i18n/texts.ts';
import { pruneTickets } from '../tickets.ts';
import type { JobResult } from './index.ts';

/** Once a day: guest lists and check-ins go some weeks after their concert (docs/tickets-plan.md §5). */
export async function pruneTicketOrders(): Promise<JobResult> {
	return { ok: true, summary: t.status.ticketsPruned(await pruneTickets()) };
}
