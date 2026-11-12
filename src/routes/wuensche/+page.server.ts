import { fail } from '@sveltejs/kit';
import { config } from '#lib/config/index.ts';
import { mayDeleteWish, safeLink, sortWishes, submitterEmail, WISH_STATUSES, type WishKind, type WishStatus } from '#lib/feedback/feedback.ts';
import { t } from '#lib/i18n/index.ts';
import { searchText } from '#lib/music/text.ts';
import { shortDateLabel } from '#lib/repertoire/dates.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { requireFeature } from '#lib/server/env.ts';
import { addWish, deleteWish, feedbackUser, formText, setWishStatus, voteOnWish } from '#lib/server/feedback.ts';
import { getLibrary, isPastConcert } from '#lib/server/library.ts';
import { getFeedback } from '#lib/server/repertoire.ts';
import { SheetLayoutError } from '#lib/server/sheet-writes.ts';
import type { Actions, PageServerLoad } from './$types';

/** Setting a wish's status and answering it is for admins. */
const MANAGE = 'mitglieder.verwalten';

export const load: PageServerLoad = async ({ locals }) => {
	requireFeature('wishes');
	const user = feedbackUser(locals);
	if (!user) return { state: 'sign-in' as const, wishes: [], canManage: false, concerts: [], archive: [] };
	const [feedback, library] = await Promise.all([getFeedback(), getLibrary()]);
	if (!feedback?.tables.wishes) return { state: 'not-set-up' as const, wishes: [], canManage: false, concerts: [], archive: [] };

	const canManage = locals.access.rights.has(MANAGE);
	const me = user.email.toLowerCase();
	// A piece request that came true links to the piece, matched by title.
	const pieceByTitle = new Map(library.pieces.map((piece) => [searchText(piece.title), piece.id]));
	return {
		state: 'ready' as const,
		canManage,
		// Upcoming concerts in the sheet, soonest first, to suggest a piece for (#91).
		concerts: upcomingConcerts(library),
		// Archive titles to pick from; a wish for one links to it.
		archive: library.pieces.map((piece) => piece.title),
		wishes: sortWishes(feedback.wishes).map((wish) => ({
			id: wish.id,
			kind: wish.kind,
			title: wish.title,
			composer: wish.composer,
			link: wish.link,
			description: wish.description,
			status: wish.status,
			answer: wish.answer,
			// "8. Okt." instead of the sheet's "2026-10-08".
			submittedAt: shortDateLabel(wish.submittedAt.slice(0, 10), library.today, config.locale) || wish.submittedAt,
			// Who asked is for admins; everyone else sees only how many agree. The name shows, the address is a tooltip.
			submittedBy: canManage ? submitterName(wish.submittedBy) || t.wishes.anonymous : undefined,
			submitterEmail: canManage && wish.submittedBy ? submitterEmail(wish.submittedBy) : undefined,
			votes: wish.votes.length,
			voted: wish.votes.includes(me),
			canDelete: mayDeleteWish(wish, me, canManage),
			pieceId: wish.pieceId ?? (wish.kind === 'piece' && wish.title ? pieceByTitle.get(searchText(wish.title)) : undefined),
			pieceStatus: library.piecesById.get(wish.pieceId ?? pieceByTitle.get(searchText(wish.title)) ?? '')?.status,
			concert: wish.concert
		}))
	};
};

/** "Jonas Geiger <jonas@example.org>" → "Jonas Geiger"; a bare address stays as it is. */
function submitterName(submittedBy: string): string {
	return submittedBy.replace(/\s*<[^<>]+>\s*$/, '').trim() || submittedBy.trim();
}

function upcomingConcerts(library: Awaited<ReturnType<typeof getLibrary>>) {
	return library.concerts
		.filter((concert) => concert.sheet && !isPastConcert(concert, library.today))
		.reverse()
		.map((concert) => ({ title: concert.sheet!.ref, label: concert.label?.long }));
}

/** Runs one change; a missing tab or a failed write becomes a message. */
async function save(work: () => Promise<boolean | void>) {
	try {
		if ((await work()) === false) return fail(404, { message: t.wishes.gone });
		return { saved: true };
	} catch (cause) {
		if (cause instanceof SheetLayoutError) return fail(409, { message: t.wishes.notSetUp });
		console.error('Saving a wish failed:', cause);
		return fail(503, { message: t.wishes.failed });
	}
}

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const user = feedbackUser(locals);
		if (!user) return fail(403, { message: t.wishes.signInNeeded });
		const data = await request.formData();
		const kind: WishKind = formText(data, 'kind') === 'feature' ? 'feature' : 'piece';
		const title = formText(data, 'title');
		const description = formText(data, 'description', 2000);
		const rawLink = formText(data, 'link', 500);
		const link = rawLink ? safeLink(rawLink) : '';
		if (link === undefined) return fail(400, { message: t.wishes.invalidLink, kind });
		if (kind === 'piece' && !title) return fail(400, { message: t.wishes.titleMissing, kind });
		if (kind === 'feature' && !description) return fail(400, { message: t.wishes.descriptionMissing, kind });
		// A piece from the archive is linked by its id; a concert must be an upcoming one.
		const library = await getLibrary();
		const archived = kind === 'piece' ? library.pieces.find((piece) => searchText(piece.title) === searchText(title)) : undefined;
		const concertTitle = formText(data, 'concert');
		const concert = upcomingConcerts(library).find((c) => c.title === concertTitle)?.title ?? '';
		const wish = {
			kind,
			concert: kind === 'piece' ? concert : '',
			pieceId: archived?.id,
			// A feature request's title is the start of its description, so the sheet stays readable.
			title: kind === 'piece' ? title : title || description.split('\n')[0].slice(0, 80),
			composer: kind === 'piece' ? formText(data, 'composer') || (archived?.composer ?? '') : '',
			link,
			description
		};
		const result = await save(() => addWish(user, wish, { anonymous: data.get('anonymous') === 'on' }));
		return 'status' in result ? result : { added: true, kind };
	},

	vote: async ({ request, locals }) => {
		const user = feedbackUser(locals);
		if (!user) return fail(403, { message: t.wishes.signInNeeded });
		const id = formText(await request.formData(), 'id', 40);
		return save(() => voteOnWish(id, user));
	},

	delete: async ({ request, locals }) => {
		const user = feedbackUser(locals);
		if (!user) return fail(403, { message: t.wishes.signInNeeded });
		const id = formText(await request.formData(), 'id', 40);
		let forbidden = false;
		const result = await save(async () => {
			const done = await deleteWish(id, user, locals.access.rights.has(MANAGE));
			forbidden = done === 'forbidden';
			return done !== false;
		});
		return forbidden ? fail(403, { message: t.wishes.notYours }) : result;
	},

	status: async ({ request, locals }) => {
		requireRight(locals, MANAGE);
		const data = await request.formData();
		const status = formText(data, 'status') as WishStatus;
		if (!WISH_STATUSES.includes(status)) return fail(400, { message: t.wishes.failed });
		return save(() => setWishStatus(formText(data, 'id', 40), status, formText(data, 'answer', 1000), locals.access.user?.email ?? ''));
	}
};
