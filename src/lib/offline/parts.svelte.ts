/**
 * Parts kept on the device (#62): any part's PDF, saved from "Meine Noten" or a piece page, in
 * the service worker's cache, so it opens in the app's viewer without a connection. Each copy
 * carries its piece and label in a header, so "Meine Noten" can list them while offline.
 * The cache name and the header match src/service-worker/index.ts.
 */
import type { Glyph } from '#lib/music/instrument-glyph.ts';

export const NOTEN = 'noten-v1';
export const META = 'x-offline-part';

/** What a saved part shows in the list and the viewer. */
export interface OfflinePart {
	id: string;
	label: string;
	piece: string;
	pieceId?: string;
	glyph?: Glyph;
}

export const pdfPath = (id: string) => `/api/noten/${encodeURIComponent(id)}`;

const encode = (part: OfflinePart) => encodeURIComponent(JSON.stringify({ label: part.label, piece: part.piece, pieceId: part.pieceId, glyph: part.glyph }));

/** The part's piece and label from a saved copy; copies saved before they were kept have none. */
export function decodeMeta(id: string, header: string | null): OfflinePart | null {
	if (!header) return null;
	try {
		const meta = JSON.parse(decodeURIComponent(header)) as Partial<OfflinePart>;
		return typeof meta.label === 'string' && typeof meta.piece === 'string' ? { id, label: meta.label, piece: meta.piece, pieceId: meta.pieceId, glyph: meta.glyph } : null;
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

	has = (id: string) => this.saved.has(id);

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
		const cache = await caches.open(NOTEN);
		const found = new Map<string, OfflinePart | null>();
		for (const request of await cache.keys()) {
			const id = idOf(request.url);
			found.set(id, decodeMeta(id, (await cache.match(request))?.headers.get(META) ?? null));
		}
		this.saved = found;
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
				headers.set(META, encode(part));
				await cache.put(pdfPath(part.id), new Response(await response.blob(), { headers }));
			} catch {
				failed++;
			}
		}
		await this.read();
		return failed;
	}

	async remove(ids: string[]) {
		const cache = await caches.open(NOTEN);
		for (const id of ids) await cache.delete(pdfPath(id));
		await this.read();
	}
}

export const offlineParts = new OfflineParts();
