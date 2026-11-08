import { openItems } from '#lib/server/todo.ts';
import { today } from '#lib/server/members.ts';
import type { PageServerLoad } from './$types';

/**
 * Everything waiting for you in one list (#185): reports, wishes, access requests, rented
 * music, attendance, date polls, parts to scan and the Kummerkasten, each where it's done.
 * Only what this person may act on, the same as the counts on the start page.
 */
export const load: PageServerLoad = async ({ locals }) => ({ items: await openItems(locals), today: today() });
