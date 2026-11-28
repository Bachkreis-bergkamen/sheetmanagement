import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self as sw } from '$app/service-worker';
import { sendPending } from '#lib/offline/marks.ts';
import { networkOr } from '#lib/offline/patience.ts';
import jbig2 from 'pdfjs-dist/wasm/jbig2.wasm?url';
import openjpeg from 'pdfjs-dist/wasm/openjpeg.wasm?url';
import qcms from 'pdfjs-dist/wasm/qcms_bg.wasm?url';

/**
 * Offline mode for rehearsal halls with bad reception (#62). The app's own files come from
 * the cache; pages are fetched fresh and kept, so the last version of every page a member
 * opened still shows without a connection. The music table, every piece's page and "Meine Noten"
 * are kept ahead of time, once a day, so they open offline without having been opened. Parts
 * saved on "Meine Noten" or a piece page are kept too, and the member's parts for their next two
 * concerts on their own, each with the viewer's page. Pen marks drawn offline wait in MARKS
 * (src/lib/offline/marks.ts). Signing out deletes everything personal.
 * A kept page links the styles and scripts of the version that made it, so after an update the
 * older version's files stay on the device until no kept page needs them any more; online, kept
 * pages are fetched again from the new version first.
 * It also shows reminders (#157).
 */

const APP = `app-${version}`;
/** Pages as last seen, including SvelteKit's page data for navigating inside the app. */
const PAGES = 'pages-v1';
/** The music table, the pieces' pages and "Meine Noten": not trimmed, refreshed once a day. */
const LIBRARY = 'library-v1';
/** Part PDFs saved on "Meine Noten" or a piece page; the header holds piece and label (src/lib/offline/parts.svelte.ts). */
const NOTEN = 'noten-v1';
const META = 'x-offline-part';
/** Pen marks as last drawn on this device, and those still to be sent (src/lib/offline/marks.ts). */
const MARKS = 'marks-v1';
/** Parts kept ahead of time that the member took off the device (src/lib/offline/parts.svelte.ts). */
const DECLINED = '/__offline-declined';
const MAX_PAGES = 80;
/** When the library was last kept, and by which version: page data changes shape between versions. */
const WARMED = '/__offline-warmed';
const DAY = 24 * 60 * 60 * 1000;
/** How long after a failed keeping of the library it is tried again, instead of on every start. */
const RETRY_WARM = 60 * 60 * 1000;
/**
 * pdf.js's decoders for scans and colour profiles (src/routes/pdfjs-wasm). Only that server route
 * imports them, so they aren't among the app's files the build lists; without them a part kept
 * offline didn't draw: pdf.js loads the colour one with a request that blocks it until answered,
 * and on a hall's weak Wi-Fi the page stayed white.
 */
const DECODERS = [jbig2, openjpeg, qcms].map((url) => ({ path: new URL(url, sw.location.href).pathname }));
/** Paths come relative to the base path; requests are matched by their absolute path. */
const ASSETS = new Set([...immutable, ...assets, ...DECODERS].map(({ path }) => `/${path.replace(/^\//, '')}`));
/** Big files only the door's phones need (the code reader for iPhones): kept once fetched, not on install. */
const onDemand = (path: string) => path.includes('zxing_reader');

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(APP).then((cache) => cache.addAll([...ASSETS].filter((path) => !onDemand(path)))));
});

// An older version's files aren't deleted here: pages kept by it still link them (see sweep()).
sw.addEventListener('activate', (event) => {
	event.waitUntil(sw.clients.claim());
	// Not waited for: requests wait until the worker is active. The next page opened carries it on.
	void tidy();
});

// A new version waits until a page asks for it (#140); pages take it over quietly, and open tabs aren't reloaded.
// A signed-in member's page asks to keep the library offline.
sw.addEventListener('message', (event) => {
	if (event.data === 'skip-waiting') sw.skipWaiting();
	// Kept pages from before an update are brought up to date first; warm() then skips those just fetched.
	if (event.data === 'warm') event.waitUntil(tidy().then(warm));
	// A part just saved on "Meine Noten" or a piece page: its viewer's page too, so it opens offline
	// straight away, not only after the next keeping of the library. The page waits for the answer.
	const data = event.data as { type?: string; ids?: unknown } | null;
	if (data?.type === 'keep-viewers' && Array.isArray(data.ids)) {
		const ids = data.ids.filter((id): id is string => typeof id === 'string');
		event.waitUntil(keepViewers(ids).finally(() => event.ports[0]?.postMessage('kept')));
	}
});

/** The page a path belongs to: "/stuecke/x/__data.json" → "/stuecke/x". */
const pageOf = (path: string) => (path.endsWith('/__data.json') ? path.slice(0, -'/__data.json'.length) || '/' : path);
/** Pages kept in LIBRARY instead of the trimmed page cache. */
const VIEWER = /^\/ueben\/([^/]+)$/;
const kept = (page: string) => page === '/' || page === '/meine-noten' || page === '/stuecke' || /^\/stuecke\/[^/]+$/.test(page) || VIEWER.test(page);
/** Whether a saved part was kept by the worker for an upcoming concert, not saved by the member. */
function autoKept(response: Response | undefined) {
	try {
		return JSON.parse(decodeURIComponent(response?.headers.get(META) ?? '{}')).auto === true;
	} catch {
		return false;
	}
}
const keepable = (response: Response) =>
	response.ok && !response.redirected && !/no-store/i.test(response.headers.get('cache-control') ?? '');

/** The version that made a kept page, and when it was kept: the page links that version's styles and scripts. */
const MADE_BY = 'x-offline-version';
const KEPT_AT = 'x-offline-kept';
/** Keeps a page or its data, noting the version that made it. */
async function keep(cache: Cache, key: string, response: Response) {
	const headers = new Headers(response.headers);
	headers.set(MADE_BY, version);
	headers.set(KEPT_AT, String(Date.now()));
	await cache.put(key, new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers }));
}
/** Entries of the worker's own, kept next to the pages. */
const own = (path: string) => path.startsWith('/__offline-');

/** Works through the items two at a time: the device and the hall's Wi-Fi stay usable (#303). */
async function twoAtATime<T>(items: T[], work: (item: T) => Promise<void>) {
	let next = 0;
	const worker = async () => {
		while (next < items.length) await work(items[next++]);
	};
	await Promise.all([worker(), worker()]);
}

/**
 * Deletes the files of older versions that no kept page links any more. Not while a new version
 * is installing, whose files would look unneeded too. A page kept before pages noted their
 * version keeps only the oldest version's files: until pages noted it, each update deleted every
 * older version, so the oldest left is the one that made it. Without this every update's files
 * stayed, and every lookup on the device searched all of them.
 */
async function sweep() {
	if (sw.registration.installing || sw.registration.waiting) return;
	const versions = (await caches.keys()).filter((key) => key.startsWith('app-'));
	const needed = new Set([APP]);
	for (const name of [PAGES, LIBRARY]) {
		const cache = await caches.open(name);
		for (const request of await cache.keys()) {
			const path = new URL(request.url).pathname;
			if (own(path) || path.endsWith('/__data.json')) continue;
			const made = (await cache.match(request))?.headers.get(MADE_BY);
			// Cache names come in the order they were made.
			needed.add(made ? `app-${made}` : versions[0]);
		}
	}
	for (const key of versions) if (!needed.has(key)) await caches.delete(key);
}

/** When the kept pages were last brought to this version: "<version> <time> <failed>". */
const TIDIED = '/__offline-tidied';
/** How long after a tidying that couldn't reach every page (offline, say) it is tried again. */
const RETRY_TIDY = 10 * 60 * 1000;
/** How long one page may take; on a hall's weak Wi-Fi a request often hangs rather than fails (#303). */
const TIDY_FETCH_MS = 15_000;
let tidying: Promise<void> | null = null;
/**
 * After an update, fetches every kept page again from the new version, so it links the new
 * version's files, then lets the old files go (sweep()). A page that fails to come (no
 * connection) stays as it is, with its version's files; after the first failure the rest aren't
 * tried, it's tried again later. Old page data is dropped: the new version's scripts read it
 * differently. Runs on activation and when a page starts (the "warm" message), never while
 * pages are being opened, and not offline.
 */
function tidy() {
	tidying ??= (async () => {
		if (!navigator.onLine) return;
		const library = await caches.open(LIBRARY);
		const [stamp, at, failedBefore] = (await (await library.match(TIDIED))?.text())?.split(' ') ?? [];
		if (stamp === version && (!Number(failedBefore) || Date.now() - Number(at) < RETRY_TIDY)) return;
		let failed = 0;
		for (const name of [PAGES, LIBRARY]) {
			const cache = await caches.open(name);
			const stale: Request[] = [];
			for (const request of await cache.keys()) {
				const path = new URL(request.url).pathname;
				if (own(path) || (await cache.match(request))?.headers.get(MADE_BY) === version) continue;
				if (path.endsWith('/__data.json')) await cache.delete(request);
				else stale.push(request);
			}
			await twoAtATime(stale, async (request) => {
				if (failed) return void failed++;
				const page = await fetch(request.url, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(TIDY_FETCH_MS) }).catch(() => null);
				if (page && keepable(page)) await keep(cache, request.url, page);
				// Gone, or no longer the member's (signed out elsewhere): it goes too.
				else if (page && page.status < 500) await cache.delete(request);
				else failed++;
			});
		}
		await sweep();
		await library.put(TIDIED, new Response(`${version} ${Date.now()} ${failed}`));
	})()
		.catch(() => undefined)
		.finally(() => (tidying = null));
	return tidying;
}

/**
 * Keeps the viewer's page for these parts. A part the viewer doesn't open (it sends the browser
 * elsewhere) is left out, not retried.
 */
async function keepViewers(ids: string[]) {
	const cache = await caches.open(LIBRARY);
	await twoAtATime(ids, async (id) => {
		const path = `/ueben/${encodeURIComponent(id)}`;
		const page = await fetch(path, { headers: { accept: 'text/html' }, redirect: 'manual' }).catch(() => null);
		if (page && keepable(page)) await keep(cache, sw.location.origin + path, page);
	});
}

let warming: Promise<void> | null = null;
/**
 * Keeps the overview, the table, "Meine Noten" and every piece's page, a few at a time, at most
 * once a day per version. As pages, not their data: SvelteKit sends page data with "no-store",
 * and without a connection the app falls back to loading the page itself.
 */
function warm() {
	warming ??= (async () => {
		const cache = await caches.open(LIBRARY);
		const [stamp, at, failedBefore] = (await (await cache.match(WARMED))?.text())?.split(' ') ?? [];
		// Once a day; after a failed run in an hour, not on every start (#303).
		if (stamp === version && Date.now() - Number(at) < (Number(failedBefore) ? RETRY_WARM : DAY)) return;
		const response = await fetch('/api/offline');
		if (!response.ok) return;
		const { pieces, parts = [] } = (await response.json()) as {
			pieces: string[];
			parts?: { id: string; label: string; piece: string; pieceId: string; glyph?: string }[];
		};
		const piecePages = pieces.map((id) => `/stuecke/${encodeURIComponent(id)}`);
		let failed = 0;
		// The member's own pages come first (#303). One just fetched again after an update (tidy()) isn't fetched twice.
		await twoAtATime(['/', '/stuecke', '/meine-noten', ...piecePages], async (path) => {
			const copy = await cache.match(sw.location.origin + path);
			if (copy?.headers.get(MADE_BY) === version && Date.now() - Number(copy.headers.get(KEPT_AT)) < RETRY_WARM) return;
			const page = await fetch(path, { headers: { accept: 'text/html' } }).catch(() => null);
			if (page && keepable(page)) await keep(cache, sw.location.origin + path, page);
			else failed++;
		});

		// The member's parts for their next two concerts, unless they took one off; a copy already
		// kept stays as it is (opening it online refreshes it).
		const noten = await caches.open(NOTEN);
		const declined = new Set(((await (await cache.match(DECLINED))?.json().catch(() => [])) ?? []) as string[]);
		const upcoming = parts.filter((part) => !declined.has(part.id));
		await twoAtATime(upcoming, async (part) => {
			const path = `/api/noten/${encodeURIComponent(part.id)}`;
			if (await noten.match(path)) return;
			const pdf = await fetch(path).catch(() => null);
			if (!pdf?.ok) return void failed++;
			const headers = new Headers(pdf.headers);
			headers.set(META, encodeURIComponent(JSON.stringify({ label: part.label, piece: part.piece, pieceId: part.pieceId, glyph: part.glyph, auto: true })));
			await noten.put(path, new Response(await pdf.blob(), { headers }));
		});
		// Kept ahead of time for a concert that's over (or a part no longer theirs): it goes.
		const wantedParts = new Set(upcoming.map((part) => part.id));
		const savedIds = new Set<string>();
		for (const request of await noten.keys()) {
			const id = decodeURIComponent(new URL(request.url).pathname.slice('/api/noten/'.length));
			if (!wantedParts.has(id) && autoKept(await noten.match(request))) await noten.delete(request);
			else savedIds.add(id);
		}
		// The viewer's page for every part on the device, so it opens there offline too.
		await keepViewers([...savedIds]);

		// Pieces no longer in the archive go, and the viewer's pages of parts no longer on the device.
		const wanted = new Set(piecePages);
		for (const request of await cache.keys()) {
			const page = pageOf(new URL(request.url).pathname);
			if (/^\/stuecke\/[^/]+$/.test(page) && !wanted.has(page)) await cache.delete(request);
			const viewer = VIEWER.exec(page);
			if (viewer && !savedIds.has(decodeURIComponent(viewer[1]))) await cache.delete(request);
		}
		await cache.put(WARMED, new Response(`${version} ${Date.now()} ${failed}`));
		await sweep();
	})()
		.catch(() => undefined)
		.finally(() => (warming = null));
	return warming;
}

/** Keeps the page cache small: the oldest entries go first. */
async function trim(cache: Cache) {
	const keys = await cache.keys();
	for (const key of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(key);
}

/**
 * The page for a page never opened on this device, in the app's language (#124). Its own few
 * words, so the worker doesn't load every text of the app.
 */
const OFFLINE = {
	de: {
		title: 'Keine Verbindung',
		text: 'Diese Seite war noch nicht auf diesem Gerät geöffnet, deshalb gibt es sie offline nicht.',
		hint: 'Seiten, die du schon einmal geöffnet hast, und offline gespeicherte Noten gehen auch ohne Netz.',
		myParts: 'Zu „Meine Noten“',
		home: 'Zur Übersicht'
	},
	en: {
		title: 'No connection',
		text: "This page hasn't been opened on this device yet, so it isn't available offline.",
		hint: 'Pages you have opened before and parts saved for offline use work without a connection too.',
		myParts: 'To “My parts”',
		home: 'To the overview'
	}
}[__LANGUAGE__];

/**
 * The app's own files of this version. Looked up in its own cache, not across all of them: every
 * cache searched (older versions' files, saved parts) makes each style and script slower to come.
 */
const inApp = async (path: string) => (await caches.open(APP)).match(path);
/** A kept page or its data, from either page cache. */
const keptCopy = async (request: RequestInfo, options?: CacheQueryOptions) =>
	(await (await caches.open(PAGES)).match(request, options)) ?? (await (await caches.open(LIBRARY)).match(request, options));

const offlinePage = () =>
	new Response(
		`<!doctype html><html lang="${__LANGUAGE__}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.5">
<h1>${OFFLINE.title}</h1><p>${OFFLINE.text}</p>
<p>${OFFLINE.hint}</p>
<p><a href="/meine-noten">${OFFLINE.myParts}</a> · <a href="/">${OFFLINE.home}</a></p></body></html>`,
		{ status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } }
	);

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	// Signing out: nothing personal stays on the device, and it gets no more reminders. The
	// device is taken off first, while the member is still signed in. Switching to another
	// account kept on the device (/auth/konto) likewise: its pages and reminders aren't the next one's.
	// Pen marks drawn offline go to the server first, as the account that drew them, then go too.
	if (request.method === 'POST' && (url.pathname === '/auth/logout' || url.pathname === '/auth/konto')) {
		event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(LIBRARY), caches.delete(NOTEN)]));
		event.respondWith(
			(async () => {
				await sendPending().catch(() => 0);
				await caches.delete(MARKS);
				const subscription = await sw.registration.pushManager?.getSubscription().catch(() => null);
				if (subscription) {
					await fetch('/api/push', {
						method: 'DELETE',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ endpoint: subscription.endpoint })
					}).catch(() => undefined);
					await subscription.unsubscribe().catch(() => undefined);
				}
				return fetch(request);
			})()
		);
		return;
	}
	if (request.method !== 'GET') return;

	// The app's own files, fixed per version.
	if (ASSETS.has(url.pathname)) {
		event.respondWith(
			inApp(url.pathname).then(
				(cached) =>
					cached ??
					fetch(request).then(async (response) => {
						if (response.ok && onDemand(url.pathname)) await (await caches.open(APP)).put(url.pathname, response.clone());
						return response;
					})
			)
		);
		return;
	}

	// An older version's files: for a page kept by that version, or one still open from before an update.
	if (url.pathname.startsWith('/_app/immutable/')) {
		event.respondWith(caches.match(url.pathname).then((cached) => cached ?? fetch(request)));
		return;
	}

	// pdf.js's decoders for scanned pages (src/routes/pdfjs-wasm) point to the app's own files;
	// taken from there straight away, so scanned parts open offline too.
	if (url.pathname.startsWith('/pdfjs-wasm/')) {
		const name = url.pathname.slice('/pdfjs-wasm/'.length).replace(/\.wasm$/, '');
		// Bundled as e.g. "_app/immutable/assets/jbig2.BUnLb-NU.wasm".
		const asset = [...ASSETS].find((path) => path.endsWith('.wasm') && path.split('/').pop()!.startsWith(`${name}.`));
		if (asset) {
			event.respondWith(inApp(asset).then((cached) => cached ?? fetch(request)));
			return;
		}
	}

	// A part's PDF: fresh when online, updating a saved copy (with its piece and label); the saved copy offline.
	if (url.pathname.startsWith('/api/noten/')) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(NOTEN);
				let stored: Promise<unknown> = Promise.resolve();
				const fresh = fetch(request).then(async (response) => {
					const saved = response.ok && (await cache.match(url.pathname));
					if (saved) {
						const headers = new Headers(response.headers);
						const meta = saved.headers.get(META);
						if (meta) headers.set(META, meta);
						stored = response
							.clone()
							.blob()
							.then((body) => cache.put(url.pathname, new Response(body, { headers })));
					}
					return response;
				});
				// Answered from the device, the fresh copy still lands there.
				event.waitUntil(fresh.then(() => stored).catch(() => undefined));
				try {
					return await networkOr(fresh, () => cache.match(url.pathname));
				} catch {
					return (await cache.match(url.pathname)) ?? Response.error();
				}
			})()
		);
		return;
	}

	// Sign-in, feeds, other endpoints: always the network.
	const data = url.pathname.endsWith('/__data.json');
	if (!data && request.mode !== 'navigate') return;
	if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/') || url.pathname.startsWith('/demo')) return;

	event.respondWith(
		(async () => {
			const library = kept(pageOf(url.pathname));
			const cache = await caches.open(library ? LIBRARY : PAGES);
			// Page data carries a changing "x-sveltekit-invalidated" parameter; the path is what counts.
			const key = data ? url.origin + url.pathname : request.url;
			// Either cache: a page may have been kept before it moved to the library.
			const copy = async () => (await keptCopy(key)) ?? (data ? undefined : await keptCopy(request, { ignoreSearch: true }));
			let stored: Promise<unknown> = Promise.resolve();
			const fresh = fetch(request).then((response) => {
				// Files sent with "no-store" (a member's data export, the music list) are never kept.
				// Stored alongside, not before the page is handed over (#303).
				if (keepable(response)) stored = keep(cache, key, response.clone()).then(() => (library ? undefined : trim(cache)));
				return response;
			});
			event.waitUntil(fresh.then(() => stored).catch(() => undefined));
			try {
				if (!library) return await fresh;
				// A kept page that takes too long: its copy (#303). Page data is never kept, so a slow
				// one gives way to loading the page itself, which then comes from the device.
				if (!data) return await networkOr(fresh, copy);
				const page = sw.location.origin + pageOf(url.pathname);
				return await networkOr(fresh, async () => ((await cache.match(page)) ? Response.error() : undefined));
			} catch {
				const cached = await copy();
				if (cached) return cached;
				return data ? Response.error() : offlinePage();
			}
		})()
	);
});

/** A reminder from the app (#157): title, text, the page to open, and a tag that replaces an older one. */
sw.addEventListener('push', (event) => {
	const notice = (() => {
		try {
			return (event.data?.json() ?? {}) as { title?: string; body?: string; url?: string; tag?: string; icon?: string };
		} catch {
			return { body: event.data?.text() };
		}
	})();
	event.waitUntil(
		sw.registration.showNotification(notice.title ?? '', { body: notice.body, tag: notice.tag, icon: notice.icon, data: { url: notice.url ?? '/' } })
	);
});

/** A tap opens the page, in an open window of the app if there is one. */
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = new URL((event.notification.data as { url?: string } | null)?.url ?? '/', sw.location.origin);
	if (url.origin !== sw.location.origin) return;
	event.waitUntil(
		(async () => {
			const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const open = windows.find((client) => new URL(client.url).origin === url.origin);
			if (!open) return void (await sw.clients.openWindow(url.href));
			await open.focus();
			await open.navigate(url.href).catch(() => undefined);
		})()
	);
});
