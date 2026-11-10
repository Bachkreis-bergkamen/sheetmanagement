/**
 * Pen marks on this device (#62): the last state of every page the member drew on here, and
 * whether it still has to reach the server. Drawn without a connection, a page waits here and is
 * sent once the device is online again; the viewer opened offline (from a page kept days ago)
 * shows what was drawn since. Kept in Cache Storage, so signing out deletes it with the rest
 * (src/service-worker/index.ts, MARKS).
 */
import type { Stroke } from '#lib/practice/marks.ts';

export const MARKS = 'marks-v1';

export interface KeptPage {
	strokes: Stroke[];
	/** Not on the server yet. */
	pending: boolean;
}

const available = () => typeof caches !== 'undefined';
const keyOf = (file: string, page: number) => `/__marks/${encodeURIComponent(file)}/${page}`;
const parseKey = (url: string): { file: string; page: number } | null => {
	const match = /\/__marks\/([^/]+)\/(\d+)$/.exec(new URL(url, 'http://x').pathname);
	return match ? { file: decodeURIComponent(match[1]), page: Number(match[2]) } : null;
};

/** Remembers a page as drawn; `pending` when it couldn't be sent. Never throws. */
export async function keepPage(file: string, page: number, strokes: Stroke[], pending: boolean): Promise<void> {
	if (!available()) return;
	try {
		await (await caches.open(MARKS)).put(keyOf(file, page), Response.json({ strokes, pending } satisfies KeptPage));
	} catch {
		// Storage full or blocked: the marks still are on the page, and on the server if sent.
	}
}

/** The pages of one part kept on this device, by page number. */
export async function keptPages(file: string): Promise<Record<number, KeptPage>> {
	const found: Record<number, KeptPage> = {};
	if (!available()) return found;
	try {
		const cache = await caches.open(MARKS);
		for (const request of await cache.keys()) {
			const key = parseKey(request.url);
			if (key?.file !== file) continue;
			const kept = (await (await cache.match(request))?.json()) as KeptPage | undefined;
			if (kept && Array.isArray(kept.strokes)) found[key.page] = kept;
		}
	} catch {
		// Nothing kept, then.
	}
	return found;
}

/**
 * The marks to show: the server's, with what this device drew and couldn't send yet on top. Offline,
 * the page may be days old, so every page this device knows wins.
 */
export function mergeMarks(server: Record<number, Stroke[]>, kept: Record<number, KeptPage>, online: boolean): Record<number, Stroke[]> {
	const merged = { ...server };
	for (const [page, entry] of Object.entries(kept)) if (entry.pending || !online) merged[Number(page)] = entry.strokes;
	return merged;
}

let sending: Promise<number> | null = null;

/**
 * Sends the pages still waiting, one after another; returns how many went. A page the server
 * refuses for good (not a part of the archive, too much ink) is dropped; on a network error or a
 * busy server the rest waits for the next try.
 */
export function sendPending(): Promise<number> {
	sending ??= (async () => {
		if (!available() || !navigator.onLine) return 0;
		let sent = 0;
		const cache = await caches.open(MARKS);
		for (const request of await cache.keys()) {
			const key = parseKey(request.url);
			const kept = (await (await cache.match(request))?.json().catch(() => null)) as KeptPage | null;
			if (!key || !kept?.pending) continue;
			const response = await fetch('/api/ueben/notizen', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ file: key.file, page: key.page, strokes: kept.strokes })
			}).catch(() => null);
			if (!response || response.status === 429 || response.status >= 500 || response.status === 403) break;
			// Drawn again meanwhile: that newer state is what counts, and it's on its own way.
			const now = (await (await cache.match(request))?.json().catch(() => null)) as KeptPage | null;
			if (now && JSON.stringify(now.strokes) !== JSON.stringify(kept.strokes)) continue;
			if (response.ok) {
				await cache.put(request, Response.json({ strokes: kept.strokes, pending: false } satisfies KeptPage));
				sent++;
			} else await cache.delete(request);
		}
		return sent;
	})()
		.catch(() => 0)
		.finally(() => (sending = null));
	return sending;
}
