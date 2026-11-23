import { error, json } from '@sveltejs/kit';
import { config } from '#lib/config/index.ts';
import * as t from '#lib/i18n/texts.ts';
import { hasCompleteParts, imslpHas, imslpVoices, mayBeOnImslp, searchUrl } from '#lib/music/imslp.ts';
import { voiceText } from '#lib/music/instrumentation.ts';
import { isGap } from '#lib/repertoire/missing-parts.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { imslpWork } from '#lib/server/imslp.ts';
import { getLibrary } from '#lib/server/library.ts';
import type { RequestHandler } from './$types';

/**
 * A piece's missing parts on IMSLP (#198), for "Fehlende Stimmen" (?stueck=<id>): the work's
 * page, the parts it has, and for each missing part whether one of them fits. Only for pieces
 * where looking can help (mayBeOnImslp); the page shows the button only for those.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	requireRight(locals, 'stuecke.bearbeiten');
	const library = await getLibrary();
	const piece = library.piecesById.get(url.searchParams.get('stueck') ?? '');
	if (!piece) error(404, t.error.notFound);
	const facts = { title: piece.title, composer: piece.composer, catalogue: piece.catalogue, genre: piece.sheet?.genre, arranger: piece.sheet?.arranger };
	if (!mayBeOnImslp(facts)) error(404, t.imslp.notSearchable);
	const search = searchUrl(facts);
	let work;
	try {
		work = await imslpWork(facts);
	} catch (cause) {
		console.error('Looking up IMSLP failed:', cause instanceof Error ? cause.message : cause);
		return json({ state: 'unavailable' as const, search }, { status: 502 });
	}
	if (!work) return json({ state: 'none' as const, search });
	const available = imslpVoices(work.parts, config);
	const gaps = (piece.detail?.parts ?? []).filter(isGap).map((part) => ({ id: part.id, label: part.label, found: imslpHas(part.voices, available) }));
	return json({
		state: 'found' as const,
		search,
		title: work.title,
		url: work.url,
		parts: available.map(voiceText),
		complete: hasCompleteParts(work.parts),
		gaps
	});
};
