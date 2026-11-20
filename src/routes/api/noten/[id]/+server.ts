import { error } from '@sveltejs/kit';
import type { Catalog } from '#lib/music/catalog.ts';
import { getCatalog } from '#lib/server/catalog.ts';
import { GoogleApiError } from '#lib/server/google/client.ts';
import { downloadFile } from '#lib/server/google/drive.ts';
import { getGoogle } from '#lib/server/services.ts';
import type { RequestHandler } from './$types';
import * as t from '#lib/i18n/texts.ts';

const PDF = 'application/pdf';

// The PDFs of the archive, per catalog snapshot, so a lookup is one Set.has.
const pdfIds = new WeakMap<Catalog, Set<string>>();
function archivePdfs(catalog: Catalog): Set<string> {
	let ids = pdfIds.get(catalog);
	if (!ids) {
		ids = new Set(catalog.pieces.flatMap((piece) => piece.parts.filter((part) => part.mimeType === PDF).map((part) => part.id)));
		pdfIds.set(catalog, ids);
	}
	return ids;
}

/**
 * One part's PDF, fetched by the service account, so "Meine Noten" can merge a
 * member's parts in the browser, and members without a Google account (signed in by
 * access link) can open single parts. Only for signed-in members (with sign-in off the app
 * is public, and the PDFs must stay behind Drive's own sharing), and only for PDFs that
 * are in the archive, never any other file the service account can see.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (locals.auth !== 'on' || !locals.access.member) error(403, t.messages.membersOnly);
	const catalog = await getCatalog();
	if (!catalog.ok) error(503, t.messages.archiveUnavailable);
	if (!archivePdfs(catalog.catalog).has(params.id)) error(404, t.messages.noFile);

	const file = await downloadFile(getGoogle().client, params.id).catch((cause) => {
		// Drive's status and message tell "not shared" (403/404) from "try again" (429/5xx).
		const status = cause instanceof GoogleApiError ? cause.status : 0;
		console.error(`Downloading part ${params.id} failed (${status || 'no status'}):`, cause instanceof Error ? cause.message : cause);
		error(502, t.messages.driveFailed(String(status || t.messages.noAnswer)));
	});
	return new Response(file.body, {
		headers: {
			'content-type': PDF,
			// Opened in the browser's own viewer, not saved.
			'content-disposition': 'inline',
			// Members only: never in a shared cache.
			'cache-control': 'private, max-age=600',
			'x-content-type-options': 'nosniff'
		}
	});
};
