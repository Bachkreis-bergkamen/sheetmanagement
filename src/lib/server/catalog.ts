import { config, type Instrument } from '#lib/config/index.ts';
import { buildCatalog, type Catalog } from '#lib/music/catalog.ts';
import type { DriveIndex } from './drive-index.ts';
import { version } from '$app/env';
import { appEnv, isDemo, runInBackground } from './env.ts';
import { getArchiveIndex, NotConfiguredError } from './services.ts';

// Parsing ~2000 file names takes 15-40 ms of CPU, so it happens once per archive
// snapshot and Worker instance, not on every request.
// Built again when a deployment's own instrument labels or spellings change (#143).
// The promise, so requests arriving together on a new instance share one build.
const built = new WeakMap<DriveIndex, { instruments: readonly Instrument[]; catalog: Promise<Catalog> }>();

/**
 * The built catalog in KV as well, by the index it was built from: a new Worker instance reads
 * it in ~2 ms instead of parsing for 25 ms or more, beyond the free plan's 10 ms CPU, which
 * failed requests whenever many people came at once and new instances started.
 */
const CATALOG_KEY = 'catalog:v1';
type StoredCatalog = { builtAt: string; signature: string; catalog: Omit<Catalog, 'byId'> };

const signatures = new WeakMap<readonly Instrument[], string>();
/** What the parse depends on besides the index: this deployment's code and its instruments. */
function signatureOf(instruments: readonly Instrument[]): string {
	let signature = signatures.get(instruments);
	if (!signature) {
		signature = `${version}:${JSON.stringify(instruments)}`;
		signatures.set(instruments, signature);
	}
	return signature;
}

async function catalogFor(index: DriveIndex): Promise<Catalog> {
	const kv = isDemo() ? undefined : appEnv().CACHE;
	const signature = signatureOf(config.instruments);
	const stored = (await kv?.get(CATALOG_KEY, 'json').catch(() => null)) as StoredCatalog | null | undefined;
	if (stored?.builtAt === index.builtAt && stored.signature === signature) {
		return { ...stored.catalog, byId: new Map(stored.catalog.pieces.map((piece) => [piece.id, piece])) };
	}
	const catalog = buildCatalog(index, config);
	if (kv) {
		const { byId: _, ...rest } = catalog;
		const value: StoredCatalog = { builtAt: index.builtAt, signature, catalog: rest };
		// Only when the index changed; two instances at once may both try, and KV takes one write a second per key.
		runInBackground(kv.put(CATALOG_KEY, JSON.stringify(value)).catch((error) => console.error('Saving the catalog in KV failed:', error)));
	}
	return catalog;
}

export type CatalogResult =
	| { ok: true; catalog: Catalog; storedAt: number }
	| { ok: false; reason: 'not-configured' | 'failed' };

export async function getCatalog(): Promise<CatalogResult> {
	try {
		const { value: index, storedAt } = await getArchiveIndex();
		const cached = built.get(index);
		let catalog = cached?.instruments === config.instruments ? cached.catalog : undefined;
		if (!catalog) {
			catalog = catalogFor(index);
			built.set(index, { instruments: config.instruments, catalog });
			catalog.catch(() => built.delete(index));
		}
		return { ok: true, catalog: await catalog, storedAt };
	} catch (error) {
		if (error instanceof NotConfiguredError) return { ok: false, reason: 'not-configured' };
		console.error('Loading the archive failed:', error);
		return { ok: false, reason: 'failed' };
	}
}

const GOOGLE_DOC = 'application/vnd.google-apps.document';
const GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';

/** Where `fileUrl` can point, for `redirect`'s allowlist of external origins. */
export const FILE_ORIGINS = ['https://docs.google.com', 'https://drive.google.com'];

/** Opens a file in Google's own viewer, so the visitor's Drive access applies. */
export function fileUrl(id: string, mimeType: string): string {
	// The demo's files exist only in the app, so its PDFs come through the app too.
	if (isDemo() && mimeType === 'application/pdf') return `/api/noten/${encodeURIComponent(id)}`;
	if (mimeType === GOOGLE_DOC) return `https://docs.google.com/document/d/${id}/edit`;
	if (mimeType === GOOGLE_SHEET) return `https://docs.google.com/spreadsheets/d/${id}/edit`;
	return `https://drive.google.com/file/d/${id}/view`;
}

/**
 * Where a part opens: Drive's viewer, which needs a Google account with access to the
 * folder. Members signed in with an access link may have none, so their PDFs come
 * through the app (/api/noten), which checks they're a member.
 */
export function partUrl(id: string, mimeType: string, viaLink: boolean | undefined): string {
	return viaLink && mimeType === 'application/pdf' ? `/api/noten/${encodeURIComponent(id)}` : fileUrl(id, mimeType);
}

export function folderUrl(id: string): string {
	return `https://drive.google.com/drive/folders/${id}`;
}
