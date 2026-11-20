import { error, isHttpError, json } from '@sveltejs/kit';
import * as t from '#lib/i18n/texts.ts';
import { GoogleApiError } from '#lib/server/google/client.ts';
import { beginUpload, FolderError, refreshPieceFolder, suggestNames } from '#lib/server/piece-folder.ts';
import type { RequestHandler } from './$types';

/**
 * Uploading parts into a piece folder (#193), in three steps the page takes one after the
 * other: `names` suggests convention names for the dropped files, `start` opens one Drive
 * upload per file (the browser then sends the file to Drive itself), `done` reads the
 * folder again so the new parts show up.
 */
export const POST: RequestHandler = async ({ params, request, locals, url }) => {
	const body = (await request.json().catch(() => null)) as { step?: unknown; names?: unknown; name?: unknown; size?: unknown } | null;
	try {
		if (body?.step === 'names' && Array.isArray(body.names) && body.names.length <= 60) {
			const names = body.names.filter((name): name is string => typeof name === 'string').map((name) => name.slice(0, 200));
			return json(await suggestNames(locals, params.id, names));
		}
		if (body?.step === 'start' && typeof body.name === 'string' && typeof body.size === 'number') {
			return json(await beginUpload(locals, params.id, { name: body.name, size: body.size }, url.origin));
		}
		if (body?.step === 'done') {
			await refreshPieceFolder(locals, params.id);
			return json({ ok: true });
		}
	} catch (cause) {
		if (cause instanceof FolderError) error(cause.status, cause.message);
		if (isHttpError(cause)) throw cause;
		// A service account has no storage of its own: new files only go into a shared drive.
		if (cause instanceof GoogleApiError && /storage quota/i.test(cause.message)) error(409, t.pieceFolder.noQuota);
		console.error('Uploading to Drive failed:', cause);
		error(503, t.pieceFolder.failed);
	}
	error(400, t.messages.badRequest);
};
