import { error, json } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { renameFile } from '#lib/server/google/drive.ts';
import { getCatalog } from '#lib/server/catalog.ts';
import { checkNamingSection, namingSection } from '#lib/server/naming.ts';
import { RENAME_BATCH } from '#lib/music/naming.ts';
import { driveWriteEnabled, getArchiveIndex, getGoogle, renameInArchiveIndex } from '#lib/server/services.ts';
import type { RequestHandler } from './$types';

/**
 * Renames one small batch of files in one folder, so the page can show progress and rename
 * any number of files: free Workers allow 50 Google requests per call. The names are worked
 * out again here, so only names the check suggests are ever written. `refresh` with the
 * new names writes them into the cached archive once at the end, instead of crawling the
 * whole archive again; without names it does crawl it. When nothing is cached there's
 * nothing to patch, and the next visitor reads the archive anyway.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	requireRight(locals, 'stuecke.bearbeiten');
	if (!driveWriteEnabled()) error(409, t.naming.noDriveWrite);
	const body = (await request.json().catch(() => null)) as { key?: unknown; shortTitle?: unknown; ids?: unknown; refresh?: unknown } | null;
	if (!body) error(400, t.messages.badRequest);

	if (body.refresh === true || Array.isArray(body.refresh)) {
		const names = new Map(
			(Array.isArray(body.refresh) ? body.refresh : [])
				.filter((r): r is { id: string; name: string } => typeof r?.id === 'string' && typeof r?.name === 'string')
				.map((r) => [r.id, r.name.slice(0, 300)])
		);
		// Only the renamed files: a crawl of the whole archive after every few renames costs dozens of Google requests.
		if (names.size) await renameInArchiveIndex(names).catch((cause) => console.error('Updating the cached archive failed:', cause));
		else await getArchiveIndex({ force: true }).catch((cause) => console.error('Refreshing the archive failed:', cause));
		return json({ renamed: [], failed: [] });
	}

	const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : [];
	if (typeof body.key !== 'string' || !ids.length || ids.length > RENAME_BATCH) error(400, t.messages.badRequest);
	const shortTitle = typeof body.shortTitle === 'string' ? body.shortTitle.slice(0, 120) : '';
	// Only the archive, and only this folder: the calendar and the sheet aren't needed here.
	const catalog = await getCatalog();
	if (!catalog.ok) error(503, t.naming.failedLoad);
	const section = namingSection(catalog.catalog, body.key);
	if (!section) error(404, t.naming.gone);

	const wanted = new Set(ids);
	const renames = checkNamingSection(section, shortTitle).filter((check) => wanted.has(check.id) && check.state === 'rename');
	const { client } = getGoogle();
	// All at once: each is its own file, and waiting for one before the next only adds up.
	const results = await Promise.allSettled(renames.map((check) => renameFile(client, check.id, check.suggested!)));
	const renamed: { id: string; name: string }[] = [];
	const failed: string[] = [];
	results.forEach((result, i) => {
		if (result.status === 'fulfilled') renamed.push({ id: renames[i].id, name: renames[i].suggested! });
		else {
			console.error('Renaming a file in Drive failed:', result.reason);
			failed.push(renames[i].name);
		}
	});
	return json({ renamed, failed });
};
