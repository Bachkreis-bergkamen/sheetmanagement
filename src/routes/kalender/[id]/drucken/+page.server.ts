import { error, fail } from '@sveltejs/kit';
import { performerNames } from '#lib/repertoire/ensembles.ts';
import { parseFacts, speakingSeconds } from '#lib/repertoire/facts.ts';
import { reportGaps, reportRows } from '#lib/repertoire/music-report.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { isOn } from '#lib/server/env.ts';
import { getLibrary, reportPieces } from '#lib/server/library.ts';
import { reportScopeOf, setReportScope } from '#lib/server/report-scope.ts';
import type { Actions, PageServerLoad } from './$types';
import * as t from '#lib/i18n/texts.ts';

/**
 * A concert's programme to print: a handout for the audience, the conductor's setlist, or
 * for planners the music list for the collecting society (#118). With the pieces'
 * "Wissenswertes" (#411): a Programmheft for the audience and a sheet for the moderation.
 */
const KINDS = { zettel: 'handout', setlist: 'setlist', programmheft: 'booklet', moderation: 'moderation' } as const;

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const library = await getLibrary();
	const concert = library.concertsById.get(params.id);
	if (!concert) error(404, t.messages.noConcert);
	const canReport = isOn('musicReport') && locals.access.rights.has('programme.bearbeiten');
	const art = url.searchParams.get('art');
	const kind = art === 'musikfolge' && canReport ? ('musikfolge' as const) : art && Object.hasOwn(KINDS, art) ? KINDS[art as keyof typeof KINDS] : ('handout' as const);
	const scope = await reportScopeOf(concert);
	const pieces = reportPieces(library, concert, scope);
	const partners = concert.partners;
	return {
		kind,
		canReport,
		concert: {
			id: concert.id,
			title: concert.title,
			date: concert.label?.long ?? concert.dateText,
			time: concert.event?.date.time || undefined,
			location: concert.location,
			/** Guest choirs and orchestras by their full names, for "mit …". */
			partners: partners.map((partner) => partner.name),
			organizer: concert.organizer?.name
		},
		// With guests, who plays each piece; the handout groups nothing, it just says so.
		items: concert.program.map(({ title, subtitle, notes, duration, orchestra, pieceId }) => {
			const facts = pieceId ? library.piecesById.get(pieceId)?.sheet?.facts : undefined;
			return {
				title,
				subtitle,
				notes,
				duration,
				...(partners.length ? { performers: performerNames(orchestra, partners).join(' + ') } : {}),
				pieceId,
				// Only the Programmheft and the moderation print them.
				...(kind === 'booklet' || kind === 'moderation' ? { facts: parseFacts(facts), speaking: speakingSeconds(facts) } : {})
			};
		}),
		// Who may fill in what the Programmheft and the moderation still lack.
		canEditPieces: locals.access.rights.has('stuecke.bearbeiten'),
		report:
			kind === 'musikfolge'
				? {
						rows: reportRows(pieces),
						gaps: reportGaps(pieces),
						canFill: locals.access.rights.has('stuecke.bearbeiten'),
						// Only for concerts with guests: all pieces, or only ours when a guest reports theirs.
						scope: partners.length ? scope : null
					}
				: null
	};
};

export const actions: Actions = {
	/** Which pieces of a concert with guests the music list has. */
	scope: async ({ params, request, locals }) => {
		requireRight(locals, 'programme.bearbeiten');
		const concert = (await getLibrary()).concertsById.get(params.id);
		if (!concert) error(404, t.messages.noConcert);
		const scope = String((await request.formData()).get('scope') ?? '');
		if (scope !== 'all' && scope !== 'ours') return fail(400);
		await setReportScope(concert, scope);
		return { scopeSaved: true };
	}
};
