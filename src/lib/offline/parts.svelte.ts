/**
 * Parts kept on the device (#62): any part's PDF, saved from "Meine Noten" or a piece page, in
 * the service worker's cache, so it opens in the app's viewer without a connection. Each copy
 * carries its piece and label in a header, so "Meine Noten" can list them while offline.
 * The worker also keeps the member's parts for their next two concerts on its own ("auto"), and
 * the viewer's page for every kept part. The cache names, the header and the list of parts the
 * member took off match src/service-worker/index.ts.
 */
import type { Glyph } from '#lib/music/instrument-glyph.ts';

export const NOTEN = 'noten-v1';
export const LIBRARY = 'library-v1';
export const META = 'x-offline-part';
/** Parts kept ahead of time that the member took off the device: the worker doesn't fetch them again. */
export const DECLINED = '/__offline-declined';

/** What a saved part shows in the list and the viewer. */
export interface OfflinePart {
	id: string;
	label: string;
	piece: string;
	pieceId?: string;
	glyph?: Glyph;
	/** Kept by the worker for an upcoming concert, not saved by the member: it goes after the concert. */
	auto?: boolean;
}

export const pdfPath = (id: string) => `/api/noten/${encodeURIComponent(id)}`;

export const encodeMeta = (part: OfflinePart) =>
	encodeURIComponent(JSON.stringify({ label: part.label, piece: part.piece, pieceId: part.pieceId, glyph: part.glyph, ...(part.auto ? { auto: true } : {}) }));

/** The part's piece and label from a saved copy; copies saved before they were kept have none. */
export function decodeMeta(id: string, header: string | null): OfflinePart | null {
	if (!header) return null;
	try {
		const meta = JSON.parse(decodeURIComponent(header)) as Partial<OfflinePart>;
		if (typeof meta.label !== 'string' || typeof meta.piece !== 'string') return null;
		return { id, label: meta.label, piece: meta.piece, pieceId: meta.pieceId, glyph: meta.glyph, ...(meta.auto === true ? { auto: true } : {}) };
	} catch {
		return null;
	}
}

/** The part's id from a saved copy's address. */
const idOf = (url: string) => decodeURIComponent(new URL(url).pathname.slice('/api/noten/'.length));

class OfflineParts {
	/** The saved parts by id; `null` for a copy without piece and label. */
	saved = $state<Map<string, OfflinePart | null>>(new Map());
	online = $state(true);
	/** The browser can keep them, and the orchestra uses offline mode (#134). */
	supported = $state(false);
	/** Parts with piece and label, in the order of the programme they were saved from. */
	listed = $derived([...this.saved.values()].filter((part): part is OfflinePart => !!part));

	/** Parts whose viewer page is kept too, so they open in the viewer offline, not as a bare PDF. */
	viewable = $state<Set<string>>(new Set());

	has = (id: string) => this.saved.has(id);
	/** Where a part opens offline: the viewer when its page is kept, else the saved PDF. */
	offlineHref = (id: string) => (this.viewable.has(id) ? `/ueben/${encodeURIComponent(id)}` : pdfPath(id));

	/** Reads what's on the device; call once a page that shows it is mounted. */
	start(offline: boolean) {
		this.supported = offline && 'caches' in window && 'serviceWorker' in navigator;
		const update = () => (this.online = navigator.onLine);
		update();
		addEventListener('online', update);
		addEventListener('offline', update);
		if (this.supported) this.read().catch(() => {});
		return () => {
			removeEventListener('online', update);
			removeEventListener('offline', update);
		};
	}

	async read() {
		const [cache, pages] = await Promise.all([caches.open(NOTEN), caches.open(LIBRARY)]);
		const found = new Map<string, OfflinePart | null>();
		const viewable = new Set<string>();
		for (const request of await cache.keys()) {
			const id = idOf(request.url);
			found.set(id, decodeMeta(id, (await cache.match(request))?.headers.get(META) ?? null));
			if (await pages.match(`${location.origin}/ueben/${encodeURIComponent(id)}`)) viewable.add(id);
		}
		this.saved = found;
		this.viewable = viewable;
	}

	/** The parts kept ahead of time that the member took off; the worker leaves them be. */
	private async declined(change: (ids: Set<string>) => void) {
		const pages = await caches.open(LIBRARY);
		const ids = new Set<string>(((await (await pages.match(DECLINED))?.json().catch(() => [])) ?? []) as string[]);
		change(ids);
		await pages.put(DECLINED, Response.json([...ids]));
	}

	/** Saves the parts one after another; returns how many failed. */
	async save(parts: OfflinePart[], progress?: (done: number, total: number) => void): Promise<number> {
		const cache = await caches.open(NOTEN);
		let failed = 0;
		for (const [i, part] of parts.entries()) {
			progress?.(i + 1, parts.length);
			try {
				const response = await fetch(pdfPath(part.id));
				if (!response.ok) {
					failed++;
					continue;
				}
				const headers = new Headers(response.headers);
				headers.set(META, encodeMeta({ ...part, auto: false }));
				await cache.put(pdfPath(part.id), new Response(await response.blob(), { headers }));
			} catch {
				failed++;
			}
		}
		await this.declined((ids) => parts.forEach((part) => ids.delete(part.id))).catch(() => {});
		await this.read();
		return failed;
	}

	async remove(ids: string[]) {
		const cache = await caches.open(NOTEN);
		for (const id of ids) await cache.delete(pdfPath(id));
		// Kept ahead of time and taken off by hand: not fetched again for the next concert.
		await this.declined((declined) => ids.forEach((id) => declined.add(id))).catch(() => {});
		await this.read();
	}
}

export const offlineParts = new OfflineParts();
