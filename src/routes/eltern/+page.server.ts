import { fail } from '@sveltejs/kit';
import { playsIn } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { noticeFor } from '#lib/parents/notices.ts';
import { ANSWERS, type Answer } from '#lib/signups/signups.ts';
import { euro } from '#lib/tickets/tickets.ts';
import { config } from '#lib/config/index.ts';
import { isOn } from '#lib/server/env.ts';
import { formText } from '#lib/server/feedback.ts';
import { getLibrary, orchestraOf } from '#lib/server/library.ts';
import { parentNoticeStore } from '#lib/server/parent-notices.ts';
import { parentContext } from '#lib/server/parents.ts';
import { childrenDrills, drillsAccessList } from '#lib/server/drills.ts';
import { getStore } from '#lib/server/db/index.ts';
import { getSignups } from '#lib/server/repertoire.ts';
import { SheetLayoutError } from '#lib/server/sheet-writes.ts';
import { saveSignup } from '#lib/server/signups.ts';
import { publicSale, reserve } from '#lib/server/tickets.ts';
import type { Actions, PageServerLoad } from './$types';

/** How far ahead the area lists dates: the next weeks, not the whole season. */
const DAYS_AHEAD = 60;
const MAX_DATES = 20;

export const load: PageServerLoad = async ({ locals }) => {
	const parent = await parentContext(locals);
	const signupsOn = isOn('signups');
	const [library, signups, notices] = await Promise.all([
		getLibrary(),
		signupsOn ? getSignups().catch(() => null) : null,
		parentNoticeStore()
			?.list()
			.catch((cause) => {
				console.error('Loading the notices to parents failed:', cause);
				return [];
			}) ?? []
	]);

	// The next dates of any of the children's orchestras, with who of them it is for.
	const events = library.schedule.ok ? library.schedule.events.filter((event) => !event.past && event.daysUntil <= DAYS_AHEAD) : [];
	const dates = events
		.map((event) => ({ event, children: parent.children.filter((child) => playsIn(child, orchestraOf(library, event))) }))
		.filter(({ children }) => children.length)
		.slice(0, MAX_DATES);

	// Tickets for the concerts among them, where the orchestra sells them through the app.
	const sales = new Map(
		isOn('tickets')
			? await Promise.all(
					dates
						.filter(({ event }) => event.type === 'konzert')
						.map(async ({ event }) => [event.id, await publicSale(event.id).catch(() => null)] as const)
				)
			: []
	);

	// The children's Übebereich (#300): the parent's consent, and their summary when they share it.
	const list = isOn('drills') ? await drillsAccessList() : null;
	const drills = list ? await childrenDrills(list, parent.email, parent.children).catch(() => []) : [];

	return {
		name: parent.name,
		drills,
		children: parent.children.map((child) => ({ email: child.email, name: child.name, orchestras: child.orchestras })),
		signups: signupsOn,
		notices: notices
			.filter((notice) => noticeFor(notice, parent.children.map((child) => child.orchestras)))
			.slice(0, 10)
			.map(({ id, title, body, orchestras, byName, createdAt }) => ({ id, title, body, orchestras, byName, day: createdAt.slice(0, 10) })),
		dates: dates.map(({ event, children }) => {
			const sale = sales.get(event.id);
			return {
				id: event.id,
				title: event.displayTitle,
				type: event.type,
				tentative: event.tentative,
				date: event.date,
				daysUntil: event.daysUntil,
				location: event.location,
				orchestra: orchestraOf(library, event),
				children: children.map((child) => ({
					email: child.email,
					name: child.name,
					answer: signups?.byEvent.get(event.id)?.find((signup) => signup.email === child.email)?.answer ?? null
				})),
				tickets:
					sale && sale.state === 'open'
						? {
								left: sale.left,
								maxPerOrder: sale.maxPerOrder,
								prices: sale.prices.map((price) => ({ type: price.type, label: price.label, price: euro(price.onlineCents, config.locale) }))
							}
						: null
			};
		}),
		email: parent.email
	};
};

export const actions: Actions = {
	/** Lets a child appear on the Übebereich's board and to the leaders, or takes that back (#300). */
	drillConsent: async ({ request, locals }) => {
		const parent = await parentContext(locals);
		if (!isOn('drills')) return fail(404, { drillError: t.error.notFound });
		const data = await request.formData();
		const child = parent.children.find((one) => one.email === formText(data, 'child'));
		if (!child) return fail(400, { drillError: t.parents.drills.failed });
		await getStore().setDrillConsent(child.email, parent.email, formText(data, 'allowed') === 'yes');
		return { drillSaved: child.email };
	},

	/** Answers a date for one child: coming, or excused with an optional reason. */
	answer: async ({ request, locals }) => {
		const parent = await parentContext(locals);
		if (!isOn('signups')) return fail(404, { answerError: t.signups.gone });
		const data = await request.formData();
		const answer = formText(data, 'answer') as Answer;
		const child = parent.children.find((one) => one.email === formText(data, 'child'));
		if (!ANSWERS.includes(answer) || !child) return fail(400, { answerError: t.parents.answerFailed });
		const library = await getLibrary();
		const event = library.schedule.ok ? library.schedule.byId.get(formText(data, 'event')) : undefined;
		if (!event || event.past || !playsIn(child, orchestraOf(library, event))) return fail(404, { answerError: t.signups.gone });
		const reason = formText(data, 'reason', 400);
		try {
			await saveSignup(
				{ id: event.id, label: `${event.displayTitle} · ${event.date.long}` },
				{ email: child.email, name: child.name },
				// The Leitung sees that a parent answered, and why the child can't come.
				{ answer, comment: reason ? `${reason} (${t.parents.answeredBy(parent.name)})` : t.parents.answeredBy(parent.name) }
			);
			return { answered: { event: event.id, child: child.email } };
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { answerError: t.signups.notSetUp });
			console.error('Saving a parent’s answer failed:', cause);
			return fail(503, { answerError: t.signups.failed });
		}
	},

	/** Reserves tickets for a concert of the children, paid at the Kasse like on the website. */
	tickets: async ({ request, locals }) => {
		const parent = await parentContext(locals);
		if (!isOn('tickets')) return fail(404, { ticketError: t.tickets.problems.closed, ticketConcert: '' });
		const data = await request.formData();
		const concert = formText(data, 'concert');
		const counts = Object.fromEntries(
			[...data.keys()].filter((key) => key.startsWith('count:')).map((key) => [key.slice('count:'.length), Number(formText(data, key)) || 0])
		);
		const result = await reserve(concert, { name: formText(data, 'name') || parent.name, email: parent.email, tickets: counts }, `parent:${parent.email}`);
		if (!result.ok) {
			const problem = t.tickets.problems[result.problem as keyof typeof t.tickets.problems] ?? t.tickets.problems.closed;
			return fail(result.status, { ticketError: problem, ticketConcert: concert });
		}
		return { reserved: { concert, path: result.path, mailed: result.mailed } };
	}
};
