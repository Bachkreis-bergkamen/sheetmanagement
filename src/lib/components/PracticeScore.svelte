<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { OpenScore } from '#lib/music/score-reader.ts';
	import { MARK_COLORS, MARK_SYMBOLS, MAX_PAGE_POINTS, MAX_STROKES, markLines, onPage, pagePoints, shouldIgnoreTouch, strokePath, SYMBOL_SIZE, symbolLines, thinPoints, type MarkColor, type MarkSymbol, type Stroke } from '#lib/practice/marks.ts';
	import { keepPage, keptPages, mergeMarks, sendPending } from '#lib/offline/marks.ts';
	import { flushSync, type Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	/**
	 * A part in the practice viewer: one page at a time, fitted to the screen or to its width,
	 * turned by tapping the left or right half, with the arrow and page keys, or a page-turn
	 * pedal (they send those keys). Full screen on request, with the controls above the page,
	 * never over it (#235). With the pen, the member's own marks go on the page, drawn or as
	 * symbols placed with a tap; they are saved a moment after the pen stops. They can be offered
	 * to the others who play the part, who take them over, all or one by one, or decline.
	 * Zoomed with two fingers, a trackpad pinch or the + and − buttons, e.g. to write between
	 * the staves; the page is drawn sharp again once the fingers rest.
	 */
	let {
		file,
		marks: saved,
		tools = [],
		panel,
		pen: penAllowed = true,
		onpast,
		startAt = 'first',
		startFull = false,
		onleave,
		night = false,
		extra,
		offers = [],
		sharedAt = null,
		share: canShare = true,
		page = $bindable(1)
	}: {
		file: string;
		marks: Record<number, Stroke[]>;
		/** The recording, metronome and tuner: one button each in the toolbar. */
		tools?: { value: string; label: string }[];
		/** One tool's panel, shown beside the page where there's room (see `dock`). */
		panel?: Snippet<[tool: string]>;
		/** Off in the concert mode (#194): marks show, nothing is drawn or saved. */
		pen?: boolean;
		/** Turning past the last page (1) or before the first (-1): the next or previous piece. */
		onpast?: (step: 1 | -1) => void;
		/** Where a newly opened part starts: at its end when coming back from the next piece. */
		startAt?: 'first' | 'last';
		/** Opens in full screen (needs the tap that opened it). */
		startFull?: boolean;
		/** Called when full screen ends, by the button, Escape or the browser. */
		onleave?: () => void;
		/** Light notes on black, for a dark stage. */
		night?: boolean;
		/** More controls at the start of the toolbar. */
		extra?: Snippet;
		/** What others in the member's section offer of their notes in this part, newest first. */
		offers?: Offer[];
		/** When the member last offered their own notes here to their section. */
		sharedAt?: string | null;
		/** Off for a part not of the member's instrument: nobody in their section plays it. */
		share?: boolean;
		/** The page shown, e.g. for a report about it (#306). */
		page?: number;
	} = $props();
	type Offer = { id: string; from: string; pages: Record<number, Stroke[]> };

	/** The tool shown; tools once opened stay mounted, so a metronome or drone keeps going. */
	let active = $state<string | null>(null);
	let opened = $state<string[]>([]);
	function chooseTool(tool: string) {
		active = active === tool ? null : tool;
		if (active && !opened.includes(active)) opened = [...opened, active];
	}

	let score = $state<OpenScore | null>(null);
	let pages = $state(0);
	let failed = $state(false);
	let fit = $state<'page' | 'width'>('page');
	let full = $state(false);
	let root = $state<HTMLDivElement>();
	let stage = $state<HTMLDivElement>();
	let slot = $state<HTMLDivElement>();
	let stageWidth = $state(0);
	let stageHeight = $state(0);
	/** The current page's size fitted to the screen, before zooming. */
	let fittedSize = $state<{ width: number; height: number } | null>(null);
	/** 1 is the fitted page; up to MAX_ZOOM times that. */
	let zoom = $state(1);
	/** The zoom the page is drawn at; follows `zoom` once a pinch rests, so it isn't drawn on every step. */
	let drawnZoom = $state(1);
	const MAX_ZOOM = 4;
	/** The current page's size on screen. */
	const size = $derived(fittedSize && { width: Math.round(fittedSize.width * zoom), height: Math.round(fittedSize.height * zoom) });
	let sheet = $state<HTMLDivElement>();
	/** The page can be scrolled: at its width, or zoomed in. */
	const scrolls = $derived(fit === 'width' || zoom > 1);
	/** The current page's own size, unscaled. */
	let base = $state<{ width: number; height: number } | null>(null);
	/** The page's area: in full screen the tools above the page and the stage share its height. */
	let areaHeight = $state(0);

	$effect(() => {
		const id = file;
		let opened: OpenScore | null = null;
		let cancelled = false;
		failed = false;
		(async () => {
			try {
				const { openScore } = await import('#lib/music/score-reader.ts');
				opened = await openScore(id);
				if (cancelled) return void opened.destroy();
				// The concert mode turns on into the next part: its pages, not the last part's.
				drawn.clear();
				sizes.clear();
				score = opened;
				pages = opened.doc.numPages;
				page = startAt === 'last' ? pages : 1;
			} catch {
				if (!cancelled) failed = true;
			}
		})();
		return () => {
			cancelled = true;
			opened?.destroy();
		};
	});

	// Drawn pages, kept for the pages next to the current one, so turning is instant.
	const drawn = new Map<string, HTMLCanvasElement>();
	const sizes = new Map<number, { width: number; height: number }>();
	let queue: Promise<unknown> = Promise.resolve();

	async function baseSize(current: OpenScore, number: number) {
		let found = sizes.get(number);
		if (!found) {
			const { pageSize } = await import('#lib/music/score-reader.ts');
			found = await pageSize(current, number);
			if (current === score) sizes.set(number, found);
		}
		return found;
	}

	function fitted(base: { width: number; height: number }, height = stageHeight) {
		const scale = fit === 'page' ? Math.min(stageWidth / base.width, height / base.height) : stageWidth / base.width;
		return { width: Math.max(100, Math.floor(base.width * scale)), height: Math.max(100, Math.floor(base.height * scale)) };
	}

	/** One page at one width; drawn one at a time, as pdf.js likes it. */
	function canvasFor(current: OpenScore, number: number, width: number): Promise<HTMLCanvasElement> {
		const key = `${number}@${width}`;
		const ready = drawn.get(key);
		if (ready) return Promise.resolve(ready);
		const next = queue.then(async () => {
			const again = drawn.get(key);
			if (again) return again;
			const { renderPage } = await import('#lib/music/score-reader.ts');
			const canvas = document.createElement('canvas');
			await renderPage(current, number, canvas, width);
			// A page still drawing from the part before isn't kept for this one.
			if (current !== score) return canvas;
			drawn.set(key, canvas);
			// Phones have little memory for canvases: only the last few.
			while (drawn.size > 4) drawn.delete(drawn.keys().next().value!);
			return canvas;
		});
		queue = next.catch(() => {});
		return next;
	}

	let shown = 0;
	let shownPage = 0;
	$effect(() => {
		if (!score || !slot || !stageWidth || !stageHeight) return;
		const [current, number, mode, scale] = [score, page, fit, drawnZoom];
		const token = ++shown;
		void mode;
		(async () => {
			try {
				const own = await baseSize(current, number);
				const target = fitted(own);
				const canvas = await canvasFor(current, number, Math.round(target.width * scale));
				if (token !== shown) return;
				const turned = number !== shownPage;
				shownPage = number;
				fittedSize = target;
				base = own;
				slot!.replaceChildren(canvas);
				// A new page starts at its top; a sharper drawing of the same page stays where it is.
				if (turned && scrolls) stage?.scrollTo({ top: 0, left: 0 });
				// The neighbours, ready for the next turn.
				for (const other of [number + 1, number - 1]) {
					if (other < 1 || other > pages) continue;
					canvasFor(current, other, Math.round(fitted(await baseSize(current, other)).width * scale)).catch(() => {});
				}
			} catch {
				if (token === shown) failed = true;
			}
		})();
	});

	function turn(step: number) {
		const next = Math.min(pages, Math.max(1, page + step));
		if (next !== page) {
			finishStroke();
			page = next;
		} else if (onpast && pages && Math.abs(step) === 1) onpast(step as 1 | -1);
	}

	/** With the page at its width or zoomed: down the page first, then to the next one. */
	function forward() {
		if (scrolls && stage && stage.scrollTop + stage.clientHeight < stage.scrollHeight - 4) stage.scrollBy({ top: stage.clientHeight * 0.85, behavior: 'smooth' });
		else turn(1);
	}
	function back() {
		if (scrolls && stage && stage.scrollTop > 4) stage.scrollBy({ top: -stage.clientHeight * 0.85, behavior: 'smooth' });
		else turn(-1);
	}

	const NEXT = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']);
	const PREVIOUS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']);
	function onkeydown(event: KeyboardEvent) {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
		// Space and Enter on a button press the button.
		if ((event.key === ' ' || event.key === 'Enter') && target?.closest('button, a')) return;
		if (event.key === 'Escape' && full) return void leaveFull();
		if (NEXT.has(event.key)) forward();
		else if (PREVIOUS.has(event.key)) back();
		else if (event.key === 'Home') turn(-pages);
		else if (event.key === 'End') turn(pages);
		else return;
		event.preventDefault();
	}

	/** Tapping the left half goes back, the right half forward; not while drawing or zoomed in. */
	function onstageclick(event: MouseEvent) {
		if (pen || zoom > 1 || !stage) return;
		const rect = stage.getBoundingClientRect();
		if (event.clientX - rect.left < rect.width / 2) back();
		else forward();
	}

	// Full screen: the browser's where it has one (not on iPhones), else the page covers the window.
	async function enterFull() {
		full = true;
		try {
			const element = root as (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }) | undefined;
			await (element?.requestFullscreen?.() ?? element?.webkitRequestFullscreen?.());
		} catch {
			// The covering layout is enough.
		}
	}
	function leaveFull() {
		full = false;
		if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
		onleave?.();
	}
	$effect(() => {
		if (startFull) enterFull();
	});
	$effect(() => {
		const changed = () => {
			if (!document.fullscreenElement && full) {
				full = false;
				onleave?.();
			}
		};
		document.addEventListener('fullscreenchange', changed);
		return () => document.removeEventListener('fullscreenchange', changed);
	});

	/**
	 * Zooms so the spot of the page at `fraction` (0–1 across and down) ends up under `point`
	 * on screen: by default the spot under it now, so the music under the fingers stays put.
	 */
	let settle: ReturnType<typeof setTimeout> | undefined;
	function zoomTo(next: number, point?: { x: number; y: number }, fraction?: { x: number; y: number }) {
		if (!stage || !sheet) return;
		next = Math.round(Math.min(MAX_ZOOM, Math.max(1, next)) * 100) / 100;
		const area = stage.getBoundingClientRect();
		const at = point ?? { x: area.left + area.width / 2, y: area.top + area.height / 2 };
		const before = sheet.getBoundingClientRect();
		const spot = fraction ?? { x: (at.x - before.left) / before.width, y: (at.y - before.top) / before.height };
		if (next !== zoom) {
			zoom = next;
			flushSync();
		}
		const after = sheet.getBoundingClientRect();
		stage.scrollLeft += after.left + spot.x * after.width - at.x;
		stage.scrollTop += after.top + spot.y * after.height - at.y;
		clearTimeout(settle);
		settle = setTimeout(() => (drawnZoom = zoom), 250);
	}
	const ZOOM_STEP = 1.25;

	// Two fingers zoom the page, not the browser's whole window; one finger still scrolls it.
	// Touch events, not pointer events: they can stop Safari's own pinch, which pointer events can't.
	let pinch: { distance: number; zoom: number; spot: { x: number; y: number } } | null = null;
	$effect(() => {
		const element = stage;
		if (!element) return;
		const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
		const middle = (touches: TouchList) => ({ x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 });
		const start = (event: TouchEvent) => {
			if (event.touches.length !== 2 || !sheet) return;
			event.preventDefault();
			dropTouchMark();
			const rect = sheet.getBoundingClientRect();
			const at = middle(event.touches);
			pinch = { distance: distance(event.touches), zoom, spot: { x: (at.x - rect.left) / rect.width, y: (at.y - rect.top) / rect.height } };
		};
		const move = (event: TouchEvent) => {
			if (!pinch || event.touches.length < 2) return;
			event.preventDefault();
			// The fingers moving together pan the page along: the spot follows their middle.
			zoomTo((pinch.zoom * distance(event.touches)) / pinch.distance, middle(event.touches), pinch.spot);
		};
		const end = (event: TouchEvent) => {
			if (event.touches.length < 2) pinch = null;
		};
		// Safari's own page zoom on iPhones and iPads.
		const gesture = (event: Event) => event.preventDefault();
		// A trackpad pinch arrives as a wheel with ctrl held; so does ctrl + wheel on a mouse.
		const wheel = (event: WheelEvent) => {
			if (!event.ctrlKey) return;
			event.preventDefault();
			zoomTo(zoom * Math.exp(-event.deltaY / 200), { x: event.clientX, y: event.clientY });
		};
		const options = { passive: false };
		element.addEventListener('touchstart', start, options);
		element.addEventListener('touchmove', move, options);
		element.addEventListener('touchend', end);
		element.addEventListener('touchcancel', end);
		element.addEventListener('gesturestart', gesture, options);
		element.addEventListener('gesturechange', gesture, options);
		element.addEventListener('wheel', wheel, options);
		return () => {
			element.removeEventListener('touchstart', start);
			element.removeEventListener('touchmove', move);
			element.removeEventListener('touchend', end);
			element.removeEventListener('touchcancel', end);
			element.removeEventListener('gesturestart', gesture);
			element.removeEventListener('gesturechange', gesture);
			element.removeEventListener('wheel', wheel);
		};
	});

	// The pen.
	let marks = $state<Record<number, Stroke[]>>({});
	$effect.pre(() => {
		marks = { ...saved };
	});
	// What this device drew and the server hasn't got (or, offline, a page kept days ago doesn't show).
	$effect(() => {
		const server = saved;
		const part = file;
		let stale = false;
		keptPages(part).then((kept) => {
			if (stale) return;
			const merged = mergeMarks(server, kept, navigator.onLine);
			const next = { ...marks };
			// Pages drawn on since opening are newer than anything kept.
			for (const [number, strokes] of Object.entries(merged)) if (!history.has(Number(number))) next[Number(number)] = strokes;
			marks = next;
		});
		return () => (stale = true);
	});
	// Back online: what was drawn offline goes to the server.
	$effect(() => {
		const online = () =>
			sendPending().then(() => {
				if (saving === 'queued') saving = 'saved';
			});
		if (navigator.onLine) online();
		addEventListener('online', online);
		return () => removeEventListener('online', online);
	});
	let pen = $state(false);
	let ink = $state<MarkColor>('graphite');
	/** Drawing a line, erasing, or placing a symbol with each tap. */
	let tool = $state<'line' | 'eraser' | MarkSymbol>('line');
	let drawing = $state<Stroke | null>(null);
	/** A mark that didn't fit on the page (MAX_PAGE_POINTS, MAX_STROKES) until something goes. */
	let refused = $state(false);
	/** `queued`: drawn offline, kept on the device until it can be sent. */
	let saving = $state<'idle' | 'saving' | 'saved' | 'queued' | 'failed'>('idle');
	/** Why the last save failed: the HTTP status, or none when the device was offline. */
	let failure = $state('');
	const history = new Map<number, Stroke[][]>();
	const timers = new Map<number, ReturnType<typeof setTimeout>>();
	const current = $derived(marks[page] ?? []);
	/** How full the page is, 0 to 1: drawn lines fill it, symbols hardly. */
	const fullness = $derived(Math.max(pagePoints(current) / MAX_PAGE_POINTS, current.length / MAX_STROKES));

	/** Whether one more mark still fits on the page. */
	function fits(stroke: Stroke) {
		refused = current.length >= MAX_STROKES || pagePoints(current) + stroke.points.length / 2 > MAX_PAGE_POINTS;
		return !refused;
	}

	function change(number: number, next: Stroke[]) {
		const before = history.get(number) ?? [];
		before.push(marks[number] ?? []);
		history.set(number, before.slice(-50));
		marks = { ...marks, [number]: next };
		refused = false;
		saveSoon(number);
	}

	function saveSoon(number: number) {
		clearTimeout(timers.get(number));
		saving = 'saving';
		failure = '';
		timers.set(number, setTimeout(() => save(number), 1200));
	}

	async function save(number: number, keepalive = false) {
		timers.delete(number);
		const strokes = marks[number] ?? [];
		try {
			const response = await fetch('/api/ueben/notizen', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ file, page: number, strokes }),
				keepalive
			});
			if (!response.ok) {
				failure = String(response.status);
				saving = 'failed';
			} else {
				await keepPage(file, number, strokes, false);
				if (!timers.size && saving !== 'failed' && saving !== 'queued') saving = 'saved';
			}
		} catch {
			// No connection: kept on the device and sent once it's back.
			await keepPage(file, number, strokes, true);
			failure = '';
			saving = 'queued';
		}
	}

	/** Saves what's still waiting now, before the server reads the member's marks. */
	async function flush() {
		await Promise.all([...timers].map(([number, timer]) => (clearTimeout(timer), save(number))));
	}

	// Sharing with the section: the member's own offer, and the offers of others.
	let shared = $state<string | null>(null);
	let pending = $state<Offer[]>([]);
	$effect.pre(() => {
		shared = sharedAt;
		pending = offers.map((offer) => ({ ...offer, pages: { ...offer.pages } }));
	});
	const offer = $derived(pending[0]);
	const offerCount = $derived(offer ? Object.values(offer.pages).reduce((sum, strokes) => sum + strokes.length, 0) : 0);
	let reviewing = $state(false);
	/** Marks taken over one by one from the offer shown. */
	let picked = $state(0);
	let shareNote = $state('');
	/** The offered marks shown on this page, to be taken over with a tap. */
	const offered = $derived(reviewing && offer ? (offer.pages[page] ?? []) : []);

	async function share() {
		if (!confirm(t.practice.share.confirm)) return;
		await flush();
		const response = await fetch('/api/ueben/notizen/teilen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file }) }).catch(() => null);
		if (response?.ok) {
			shared = ((await response.json()) as { at: string }).at;
			shareNote = '';
		} else shareNote = response?.status === 400 ? t.practice.share.nothing : t.practice.share.failed;
	}
	async function unshare() {
		if (!confirm(t.practice.share.confirmUnshare)) return;
		const response = await fetch('/api/ueben/notizen/teilen', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file }) }).catch(() => null);
		if (response?.ok) shared = null;
		else shareNote = t.practice.share.failed;
	}

	/** One offered mark on this page into the member's own. */
	function take(index: number) {
		if (!offer) return;
		const stroke = offered[index];
		if (!stroke || !fits(stroke)) return;
		change(page, [...current, stroke]);
		pending[0] = { ...offer, pages: { ...offer.pages, [page]: offered.filter((_, i) => i !== index) } };
		picked++;
	}

	/** Ends the offer shown: everything taken over, some by hand, or none. */
	async function answer(kind: 'all' | 'some' | 'declined') {
		if (!offer) return;
		await flush();
		const response = await fetch('/api/ueben/notizen/angebot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: offer.id, answer: kind }) }).catch(() => null);
		if (!response?.ok) return void (shareNote = t.practice.share.failed);
		const { pages: merged, skipped } = (await response.json()) as { pages: Record<number, Stroke[]>; skipped: number };
		if (Object.keys(merged).length) marks = { ...marks, ...merged };
		shareNote = skipped ? t.practice.share.skipped(skipped) : '';
		pending = pending.slice(1);
		reviewing = false;
		picked = 0;
	}

	// Leaving the page: what's still waiting goes out now.
	$effect(() => () => {
		for (const [number, timer] of timers) {
			clearTimeout(timer);
			save(number, true);
		}
	});

	function point(event: PointerEvent, element: Element): [number, number] {
		const rect = element.getBoundingClientRect();
		return [onPage((event.clientX - rect.left) / rect.width), onPage((event.clientY - rect.top) / rect.height)];
	}

	let erasing = false;
	function erase([x, y]: [number, number]) {
		const near = (stroke: Stroke) => {
			for (let i = 0; i < stroke.points.length; i += 2) if (Math.hypot(stroke.points[i] - x, stroke.points[i + 1] - y) < 0.02) return true;
			return false;
		};
		const kept = current.filter((stroke) => !near(stroke));
		if (kept.length === current.length) return;
		// One undo step for a whole wipe.
		if (!erasing) change(page, kept);
		else marks = { ...marks, [page]: kept };
		erasing = true;
		saveSoon(page);
	}

	/**
	 * The one pointer drawing: a second finger or the palm on the glass doesn't join its line
	 * (#235). Once a pen has drawn, fingers don't draw until the pen tool is turned off and on again,
	 * so a resting hand leaves no marks.
	 */
	let pointer: { id: number; type: string } | null = null;
	let penSeen = false;

	function down(event: PointerEvent) {
		if (!pen || pinch) return;
		event.preventDefault();
		if (event.pointerType === 'pen') penSeen = true;
		else if (shouldIgnoreTouch(event.pointerType, pen, penSeen)) return;
		if (pointer) {
			// A pen taking over from the hand it rests on: the hand's line goes.
			if (event.pointerType !== 'pen' || pointer.type === 'pen') return;
			drawing = null;
		}
		const element = event.currentTarget as Element;
		const at = point(event, element);
		if (tool !== 'line' && tool !== 'eraser') {
			const stamp: Stroke = { color: ink, points: at, symbol: tool };
			if (fits(stamp)) {
				change(page, [...current, stamp]);
				lastStamp = { at: Date.now(), type: event.pointerType };
			}
			return;
		}
		pointer = { id: event.pointerId, type: event.pointerType };
		// Keeps the line going past the page's edge; a browser that won't still draws on the page.
		try {
			element.setPointerCapture(event.pointerId);
		} catch {
			// Drawn without capture.
		}
		if (tool === 'eraser') {
			erasing = false;
			erase(at);
		} else drawing = { color: ink, points: at };
	}
	function move(event: PointerEvent) {
		if (!pen || pinch || event.pointerId !== pointer?.id) return;
		const element = event.currentTarget as Element;
		if (tool === 'eraser') return erase(point(event, element));
		if (!drawing) return;
		// Pens report many points between frames; all of them make a smoother line.
		const coalesced = event.getCoalescedEvents?.();
		const events = coalesced?.length ? coalesced : [event];
		const added = events.flatMap((each) => point(each, element));
		drawing = { ...drawing, points: [...drawing.points, ...added] };
	}
	function lift(event: PointerEvent) {
		if (event.pointerId !== pointer?.id) return;
		pointer = null;
		finishStroke();
	}
	/**
	 * A second finger makes it a zoom: the first finger's line so far goes, and a symbol its
	 * touch placed a moment ago too.
	 */
	let lastStamp: { at: number; type: string } | null = null;
	function dropTouchMark() {
		if (pointer?.type === 'touch') {
			drawing = null;
			pointer = null;
			erasing = false;
		}
		if (lastStamp?.type === 'touch' && Date.now() - lastStamp.at < 400) undo();
		lastStamp = null;
	}

	function finishStroke() {
		erasing = false;
		pointer = null;
		if (!drawing) return;
		const stroke = { ...drawing, points: thinPoints(drawing.points) };
		drawing = null;
		if (fits(stroke)) change(page, [...current, stroke]);
	}

	function undo() {
		const before = history.get(page);
		const last = before?.pop();
		if (last === undefined) return;
		marks = { ...marks, [page]: last };
		refused = false;
		saveSoon(page);
	}

	function clear() {
		if (!current.length || !confirm(t.practice.marks.confirmClear)) return;
		change(page, []);
	}

	/**
	 * Where the tools go, so they never cover the music and the page never shrinks for them:
	 * beside the page where its margin has room (moving the page aside, at the same size, when
	 * only both margins together do), below it where a page narrower than the screen leaves room,
	 * else above it in the page's flow, where in full screen the page gets smaller for it.
	 */
	const PANEL = 260;
	const GAP = 12;

	const dock = $derived.by(() => {
		// Decided by the page as it is without the tools: in full screen, tools above the page make
		// it smaller, and the smaller page mustn't then send them beside it, and back (#239).
		const room = full && areaHeight ? areaHeight : stageHeight;
		const whole = base ? fitted(base, room) : size;
		const width = whole?.width ?? stageWidth;
		const height = whole?.height ?? stageHeight;
		const free = stageWidth - width;
		if (fit === 'page' && free >= PANEL + GAP) {
			const left = Math.max(0, Math.min((stageWidth - width) / 2, stageWidth - PANEL - GAP - width));
			return { place: 'side', page: left, left: `${left + width + GAP}px`, top: '0px', width: `${Math.min(PANEL + 40, stageWidth - left - width - GAP)}px`, height: '100%' };
		}
		const below = room - height - GAP;
		if (fit === 'page' && size && below >= 150) {
			const left = (stageWidth - width) / 2;
			return { place: 'below', page: left, left: `${left}px`, top: `${height + GAP}px`, width: `${width}px`, height: `${below}px` };
		}
		const centred = Math.max(0, (stageWidth - (size?.width ?? width)) / 2);
		return { place: 'above', page: centred, left: undefined, top: undefined, width: undefined, height: undefined };
	});
	/**
	 * The tools where the player put them (#248): picked up by the grip and kept per device, apart
	 * for portrait, landscape and full screen, since the stand differs. Over the page, so where
	 * they cover the music is the player's choice; folded to a pill they cover little. Without a
	 * saved spot `dock` places them, as before.
	 */
	const SPOTS_KEY = 'practice-tools-spot';
	const SNAP = 16;
	type Spot = { x: number; y: number };
	function readSpots(): Record<string, Spot> {
		try {
			const value = JSON.parse(localStorage.getItem(SPOTS_KEY) ?? '{}');
			return value && typeof value === 'object' ? value : {};
		} catch {
			return {};
		}
	}
	let spots = $state<Record<string, Spot>>(typeof localStorage === 'undefined' ? {} : readSpots());
	let windowWidth = $state(0);
	let windowHeight = $state(0);
	let areaWidth = $state(0);
	let dockWidth = $state(0);
	let dockHeight = $state(0);
	let dockBox = $state<HTMLDivElement>();
	let areaBox = $state<HTMLDivElement>();
	let folded = $state(false);
	let placeNote = $state('');
	const layout = $derived(`${full ? 'full' : 'page'}-${windowWidth > windowHeight ? 'landscape' : 'portrait'}`);
	/** Inside the area, also after a rotation or resize made it smaller. */
	const clamp = ({ x, y }: Spot): Spot => ({
		x: Math.round(Math.min(Math.max(0, x), Math.max(0, areaWidth - dockWidth))),
		y: Math.round(Math.min(Math.max(0, y), Math.max(0, areaHeight - dockHeight)))
	});
	const spot = $derived(spots[layout] && areaWidth ? clamp(spots[layout]) : null);

	function saveSpots() {
		try {
			localStorage.setItem(SPOTS_KEY, JSON.stringify(spots));
		} catch {
			// Private mode or full storage: the tools stay put until the page is left.
		}
	}
	function place(next: Spot | null, save: boolean) {
		const { [layout]: _, ...rest } = spots;
		spots = next ? { ...rest, [layout]: clamp(next) } : rest;
		if (!next) folded = false;
		if (save) {
			saveSpots();
			placeNote = next ? t.practice.viewer.toolsAt(...percent(clamp(next))) : t.practice.viewer.toolsAuto;
		}
	}
	const percent = ({ x, y }: Spot): [number, number] => [Math.round((x / Math.max(1, areaWidth)) * 100), Math.round((y / Math.max(1, areaHeight)) * 100)];
	/** A light pull to the edges and corners. */
	const snap = ({ x, y }: Spot): Spot => {
		const right = areaWidth - dockWidth;
		const bottom = areaHeight - dockHeight;
		return { x: x < SNAP ? 0 : right - x < SNAP ? right : x, y: y < SNAP ? 0 : bottom - y < SNAP ? bottom : y };
	};
	/** Where the panel is now, docked or moved, in the area's coordinates. */
	function spotNow(): Spot {
		if (spot) return spot;
		const box = dockBox!.getBoundingClientRect();
		const area = areaBox!.getBoundingClientRect();
		return { x: box.left - area.left, y: box.top - area.top };
	}

	let drag: { id: number; from: Spot; startX: number; startY: number; moved: boolean } | null = null;
	let lastTap = 0;
	function grab(event: PointerEvent) {
		if (event.button !== 0 || !dockBox || !areaBox) return;
		drag = { id: event.pointerId, from: spotNow(), startX: event.clientX, startY: event.clientY, moved: false };
		try {
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		} catch {
			// The pointer is gone already; the move still follows it while it's over the grip.
		}
		event.preventDefault();
	}
	function pull(event: PointerEvent) {
		if (drag?.id !== event.pointerId) return;
		const dx = event.clientX - drag.startX;
		const dy = event.clientY - drag.startY;
		if (!drag.moved && Math.hypot(dx, dy) < 4) return;
		drag.moved = true;
		place({ x: drag.from.x + dx, y: drag.from.y + dy }, false);
	}
	function drop(event: PointerEvent) {
		if (drag?.id !== event.pointerId) return;
		const moved = drag.moved;
		drag = null;
		if (moved) return place(snap(spot ?? spotNow()), true);
		// A double tap, also by finger, where dblclick doesn't come: back to automatic.
		if (event.timeStamp - lastTap < 350) place(null, true);
		lastTap = event.timeStamp;
	}
	function nudge(event: KeyboardEvent) {
		const step = event.shiftKey ? 48 : 12;
		const by: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
		if (event.key === 'Escape') place(null, true);
		else if (by[event.key]) {
			const from = spotNow();
			place({ x: from.x + by[event.key][0], y: from.y + by[event.key][1] }, true);
		} else return;
		// Not a page turn, and not leaving full screen.
		event.preventDefault();
		event.stopPropagation();
	}

	/** The page's left edge in the stage: centred, or moved aside for the docked tools. */
	const pageLeft = $derived(active && !spot ? dock.page : Math.max(0, ((size ? stageWidth - size.width : 0) / 2)));

	const STROKE: Record<MarkColor, string> = { graphite: 'var(--mark-graphite)', red: 'var(--mark-red)', blue: 'var(--mark-blue)' };
	/** A symbol's button: its glyph in a 24 × 24 box, 10 to a symbol unit. */
	const preview = (symbol: MarkSymbol) => symbolLines(symbol, 0, 0, 1).map((line) => strokePath(line.map((n) => 12 + (n / SYMBOL_SIZE) * 10), 1, 1));
	const strokeWidth = $derived(Math.max(1.5, (size?.width ?? 600) * 0.0032));
</script>

<svelte:window {onkeydown} bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} />

<!-- In full screen the controls take a row of their own above the page, which gets the rest. -->
<div class="score" class:full class:night bind:this={root}>
	<div class="controls">
	<div class="bar">
		{#if extra}<div class="group">{@render extra()}</div>{/if}
		<div class="group">
			<button type="button" class="tool" onclick={back} disabled={page <= 1 && fit === 'page' && !onpast} aria-label={t.viewer.previous}><Icon name="back" size={16} /></button>
			<span class="pages">{t.viewer.page(page, pages || 1)}</span>
			<button type="button" class="tool" onclick={forward} disabled={page >= pages && fit === 'page' && !onpast} aria-label={t.viewer.next}><Icon name="chevron" size={16} /></button>
		</div>
		<div class="group">
			<button type="button" class="tool text" onclick={() => (fit = fit === 'page' ? 'width' : 'page')}>
				<Icon name={fit === 'page' ? 'fitWidth' : 'fitHeight'} size={15} />{fit === 'page' ? t.practice.viewer.fitWidth : t.practice.viewer.fitPage}
			</button>
			<span class="zoom" role="group" aria-label={t.practice.viewer.zoom}>
				<button type="button" class="tool" onclick={() => zoomTo(zoom / ZOOM_STEP)} disabled={zoom <= 1} aria-label={t.practice.viewer.zoomOut}><Icon name="minus" size={16} /></button>
				<button type="button" class="tool text percent" onclick={() => zoomTo(1)} disabled={zoom <= 1} aria-label={t.practice.viewer.zoomReset}>{Math.round(zoom * 100)} %</button>
				<button type="button" class="tool" onclick={() => zoomTo(zoom * ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label={t.practice.viewer.zoomIn}><Icon name="plus" size={16} /></button>
			</span>
			{#if penAllowed}
				<button type="button" class="tool text" class:on={pen} aria-pressed={pen} onclick={() => {
					if (pen) finishStroke();
					// Turned off and on again, fingers draw again until a pen does.
					penSeen = false;
					pen = !pen;
				}}>
					<Icon name="edit" size={15} />{t.practice.marks.pen}
				</button>
			{/if}
			{#each tools as each (each.value)}
				<button type="button" class="tool text" class:on={active === each.value} aria-expanded={active === each.value} onclick={() => chooseTool(each.value)}>
					{each.label}
				</button>
			{/each}
			<button type="button" class="tool text" onclick={() => (full ? leaveFull() : enterFull())} aria-pressed={full}>
				{full ? t.practice.viewer.exitFullscreen : t.practice.viewer.fullscreen}
			</button>
		</div>
	</div>

	{#if pen}
		<div class="bar pen" role="toolbar" aria-label={t.practice.marks.title}>
			<div class="group">
				{#each MARK_COLORS as each (each)}
					<button
						type="button"
						class="swatch {each}"
						class:on={ink === each && tool !== 'eraser'}
						aria-pressed={ink === each && tool !== 'eraser'}
						onclick={() => ((ink = each), tool === 'eraser' && (tool = 'line'))}
						title={t.practice.marks[each]}
					>
						<span class="dot"></span><span class="label">{t.practice.marks[each]}</span>
					</button>
				{/each}
				<button type="button" class="tool text" class:on={tool === 'eraser'} aria-pressed={tool === 'eraser'} onclick={() => (tool = tool === 'eraser' ? 'line' : 'eraser')}>{t.practice.marks.eraser}</button>
			</div>
			<!-- Symbols: a tap on the page places one; they hardly fill the page, as lines do. -->
			<div class="group symbols" role="group" aria-label={t.practice.marks.symbolsTitle}>
				{#each MARK_SYMBOLS as each (each)}
					<button
						type="button"
						class="tool symbol {ink}"
						class:on={tool === each}
						aria-pressed={tool === each}
						onclick={() => (tool = tool === each ? 'line' : each)}
						title={t.practice.marks.symbols[each]}
						aria-label={t.practice.marks.symbols[each]}
					>
						<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
							{#each preview(each) as d, i (i)}<path {d} />{/each}
						</svg>
					</button>
				{/each}
			</div>
			<div class="group">
				<button type="button" class="tool text" onclick={undo}>{t.practice.marks.undo}</button>
				<button type="button" class="tool text" onclick={clear} disabled={!current.length}>{t.practice.marks.clear}</button>
				{#if canShare}
					<button type="button" class="tool text" class:on={!!shared} aria-pressed={!!shared} onclick={() => (shared ? unshare() : share())}>
						<Icon name="users" size={15} />{shared ? t.practice.share.unshare : t.practice.share.share}
					</button>
				{/if}
				<span class="state" class:failed={saving === 'failed' || refused} role="status">
					{refused
						? t.practice.marks.pageFull
						: saving === 'saving'
							? t.practice.marks.saving
							: saving === 'failed'
								? t.practice.marks.failed(failure)
								: saving === 'queued'
									? t.practice.marks.queued
								: fullness > 0.8
									? t.practice.marks.nearlyFull
									: saving === 'saved'
										? t.practice.marks.saved
										: shared
											? t.practice.marks.sharedNote
											: t.practice.marks.private}
				</span>
			</div>
		</div>
	{/if}

	<!-- An offer from the section: above the page like the rest, never over it. -->
	{#if penAllowed && offer}
		<div class="bar offer" role="region" aria-label={t.practice.marks.title}>
			<p>
				<Icon name="users" size={15} />{t.practice.share.offered(offer.from, offerCount + picked)}
				{#if reviewing}<span class="muted">{t.practice.share.pick} {t.practice.share.onPage(offered.length)}</span>{/if}
			</p>
			<div class="group">
				<button type="button" class="tool text" class:on={reviewing} aria-pressed={reviewing} onclick={() => (reviewing ? (reviewing = false) : (finishStroke(), (pen = false), (reviewing = true)))}>
					{reviewing ? t.practice.share.hide : t.practice.share.show}
				</button>
				<button type="button" class="tool text" onclick={() => answer('all')}>{t.practice.share.takeAll}</button>
				{#if picked}
					<button type="button" class="tool text" onclick={() => answer('some')}>{t.practice.share.done}</button>
				{:else}
					<button type="button" class="tool text" onclick={() => answer('declined')}>{t.practice.share.decline}</button>
				{/if}
			</div>
		</div>
	{/if}
	{#if shareNote}<p class="share-note" role="status">{shareNote}</p>{/if}
	</div>

	<div class="area" class:docked={!!active} bind:this={areaBox} bind:clientHeight={areaHeight} bind:clientWidth={areaWidth}>
	<!-- The tools: rendered once, so a running metronome or drone carries on when the panel moves, folds or closes. -->
	{#if panel && opened.length}
		<div
			class="dock {spot ? 'free' : dock.place}"
			class:folded={spot && folded}
			hidden={!active}
			bind:this={dockBox}
			bind:offsetWidth={dockWidth}
			bind:offsetHeight={dockHeight}
			style:top={spot ? `${spot.y}px` : dock.top}
			style:left={spot ? `${spot.x}px` : dock.left}
			style:width={spot ? (folded ? undefined : `${Math.min(PANEL + 40, areaWidth)}px`) : dock.width}
			style:max-height={spot ? `${areaHeight}px` : dock.height}
		>
			<div class="handle">
				<button
					type="button"
					class="grip"
					aria-label={t.practice.viewer.moveTools}
					onpointerdown={grab}
					onpointermove={pull}
					onpointerup={drop}
					onpointercancel={() => (drag = null)}
					onkeydown={nudge}><Icon name="grip" size={18} /></button>
				{#if spot && folded}
					<button type="button" class="pill" onclick={() => (folded = false)} aria-expanded="false">{tools.find((each) => each.value === active)?.label}</button>
				{:else if spot}
					<button type="button" class="icon" onclick={() => (folded = true)} aria-expanded="true" aria-label={t.practice.viewer.fold} title={t.practice.viewer.fold}><Icon name="minus" size={16} /></button>
					<button type="button" class="icon" onclick={() => place(null, true)} aria-label={t.practice.viewer.autoPlace} title={t.practice.viewer.autoPlace}><Icon name="refresh" size={16} /></button>
				{/if}
				{#if !(spot && folded)}
					<button type="button" class="close" onclick={() => (active = null)} aria-label={t.practice.viewer.closeTools}>×</button>
				{/if}
			</div>
			<div class="panels" hidden={!!spot && folded}>
				{#each opened as tool (tool)}
					<div class="tool-panel" hidden={active !== tool}>{@render panel(tool)}</div>
				{/each}
			</div>
		</div>
	{/if}
	<p class="sr-only" role="status">{placeNote}</p>

	<!-- Taps on the page turn it; the keys and pedals work anywhere on the page. -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="stage" class:width={fit === 'width'} class:zoomed={zoom > 1} bind:this={stage} bind:clientWidth={stageWidth} bind:clientHeight={stageHeight} onclick={onstageclick}>
		{#if failed}
			<p class="msg error">{t.practice.viewer.failed}</p>
		{:else if !score}
			<p class="note">{t.viewer.loading}</p>
		{/if}
		<div
			class="sheet"
			bind:this={sheet}
			style:width={size ? `${size.width}px` : undefined}
			style:height={size ? `${size.height}px` : undefined}
			style:margin-left={size ? `${pageLeft}px` : undefined}
			hidden={!score || failed}
		>
			<div class="slot" bind:this={slot}></div>
			{#if size}
				<svg
					class="marks"
					class:drawing={pen}
					viewBox="0 0 {size.width} {size.height}"
					width={size.width}
					height={size.height}
					onpointerdown={down}
					onpointermove={move}
					onpointerup={lift}
					onpointercancel={lift}
					aria-hidden={offered.length ? undefined : 'true'}
				>
					{#each [...current, ...(drawing ? [drawing] : [])] as stroke, i (i)}
						{#each markLines(stroke, size.width / size.height) as line, j (j)}
							<path d={strokePath(line, size.width, size.height)} stroke={STROKE[stroke.color]} stroke-width={strokeWidth} />
						{/each}
					{/each}
					<!-- Offered marks, dashed; a tap takes one over (a wide invisible line makes it easy to hit). -->
					{#each offered as stroke, i (i)}
						<g
							class="offered"
							role="button"
							tabindex="0"
							aria-label={t.practice.share.take}
							onclick={(event) => (event.stopPropagation(), take(i))}
							onkeydown={(event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), event.stopPropagation(), take(i))}
						>
							{#each markLines(stroke, size.width / size.height) as line, j (j)}
								{@const d = strokePath(line, size.width, size.height)}
								<path {d} class="hit" stroke-width={Math.max(18, strokeWidth * 6)} />
								<path {d} stroke={STROKE[stroke.color]} stroke-width={strokeWidth} stroke-dasharray="{strokeWidth * 2} {strokeWidth * 2}" />
							{/each}
						</g>
					{/each}
				</svg>
			{/if}
		</div>
	</div>
	</div>
	{#if !full}<p class="hint">{t.practice.viewer.turnHint}</p>{/if}
</div>

<style>
	.score {
		--mark-graphite: #4a4a4a;
		--mark-red: #d0342c;
		--mark-blue: #1f5fd1;
		display: grid;
		/* A zoomed page scrolls inside its stage; it doesn't widen the column. */
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-2);
	}

	.controls {
		display: grid;
		gap: var(--space-2);
	}

	.score.full {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
		background: var(--bg);
	}

	/* Night: the page inverted, light notes on black, for a dark stage. */
	.score.night.full {
		background: var(--brand-ink);
	}

	.night .sheet {
		filter: invert(1) hue-rotate(180deg);
	}

	/* A row of their own above the page; nothing lies over the music (#235). */
	.full .controls {
		display: flex;
		flex: none;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-1) var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-bottom: 1px solid var(--hairline);
		background: var(--surface);
	}

	.full .bar {
		justify-content: flex-end;
	}

	/* On a tablet, Safari puts its own close button over the top left corner of a full screen page. */
	@media (pointer: coarse) {
		.full .controls {
			padding-left: max(var(--space-2), 56px);
		}
	}

	/* The page's area: the stage, and the tools where there's room for them. */
	.area {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.full .area {
		flex: 1;
		min-height: 0;
	}

	.dock {
		position: absolute;
		z-index: 3;
		overflow-y: auto;
		padding: var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
		background: var(--surface);
		box-shadow: var(--shadow);
		container-type: inline-size;
		overscroll-behavior: contain;
	}

	.dock[hidden],
	.tool-panel[hidden] {
		display: none;
	}

	/* No room beside or below: above the page, which keeps its size and moves down. */
	.dock.above {
		position: static;
		order: -1;
		max-width: 720px;
		margin-bottom: var(--space-2);
	}

	/* In full screen the page keeps most of the height: the tools scroll in what's left. */
	.full .dock.above {
		flex: none;
		max-height: 45%;
		margin: var(--space-2) var(--space-2) 0;
	}

	/* The grip, the moved panel's own buttons and the close button, staying in view while it scrolls. */
	.handle {
		position: sticky;
		top: calc(-1 * var(--space-3));
		z-index: 1;
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-2)) var(--space-2);
		background: var(--surface);
	}

	.grip {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border: 0;
		border-radius: var(--radius-s, 6px);
		background: none;
		color: var(--text-muted);
		font-size: var(--text-lg);
		line-height: 1;
		cursor: grab;
		/* The finger moves the panel, not the page. */
		touch-action: none;
	}

	.grip:active {
		cursor: grabbing;
	}

	.icon {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.pill {
		min-height: 30px;
		padding: 0 var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}

	.panels[hidden] {
		display: none;
	}

	/* Moved by the player: over the page, where they put it. */
	.dock.free {
		z-index: 4;
	}

	.dock.folded {
		/* Sized by its pill, which a size container wouldn't be. */
		container-type: normal;
		overflow: visible;
		padding: var(--space-2) var(--space-3);
	}

	.dock.folded .handle {
		margin: 0;
	}

	.close {
		flex: none;
		width: 30px;
		height: 30px;
		margin-left: auto;
		border: 0;
		border-radius: 50%;
		background: color-mix(in oklab, var(--text) 8%, transparent);
		color: var(--text-muted);
		font-size: var(--text-lg);
		line-height: 1;
		cursor: pointer;
	}

	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.group {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}

	.pages {
		min-width: 7.5em;
		color: var(--text-muted);
		font-size: var(--text-sm);
		text-align: center;
	}

	.tool,
	.swatch {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		min-width: 40px;
		height: 40px;
		padding: 0 var(--space-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.tool:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.tool.on,
	.swatch.on {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}

	.dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
	}

	.graphite .dot {
		background: var(--mark-graphite);
	}

	.red .dot {
		background: var(--mark-red);
	}

	.blue .dot {
		background: var(--mark-blue);
	}

	.symbol svg {
		fill: none;
		stroke: var(--mark-graphite);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.symbol.red svg {
		stroke: var(--mark-red);
	}

	.symbol.blue svg {
		stroke: var(--mark-blue);
	}

	.state {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.state.failed {
		color: var(--danger);
	}

	.stage {
		display: block;
		height: calc(100dvh - 220px);
		min-height: 360px;
		overflow: hidden;
		user-select: none;
		-webkit-user-select: none;
	}

	/* The page as tall as the screen. */
	.full .stage {
		flex: 1;
		height: auto;
		min-height: 0;
	}

	.stage.width {
		overflow-y: auto;
	}

	/* One finger scrolls the zoomed page; two fingers are left to the zoom, not the browser's. */
	.stage {
		touch-action: pan-x pan-y;
	}

	.stage.zoomed {
		overflow: auto;
	}

	.zoom {
		display: inline-flex;
		align-items: center;
	}

	.zoom .percent {
		min-width: 4.5em;
		justify-content: center;
		font-variant-numeric: tabular-nums;
	}

	/* An outline, not a border: the page keeps exactly the size it was fitted to. */
	.sheet {
		position: relative;
		background: #fff;
		box-shadow: 0 0 0 1px var(--hairline);
	}

	.full .sheet {
		box-shadow: none;
	}

	/* Stretched while a pinch is under way, until the page is drawn at the new size. */
	.slot :global(canvas) {
		display: block;
		width: 100% !important;
		height: auto;
	}

	.marks {
		position: absolute;
		inset: 0;
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
		pointer-events: none;
	}

	/* Offered marks take taps even while the page's own marks don't. */
	.offered {
		pointer-events: stroke;
		cursor: pointer;
		opacity: 0.75;
	}

	.offered:hover,
	.offered:focus-visible {
		opacity: 1;
		outline: none;
	}

	.offered .hit {
		stroke: var(--accent);
		stroke-opacity: 0;
	}

	.offered:hover .hit,
	.offered:focus-visible .hit {
		stroke-opacity: 0.18;
	}

	.offer {
		padding: var(--space-2);
		border: 1px solid var(--accent);
		border-radius: var(--radius-m);
		background: var(--accent-soft);
	}

	.offer p {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
	}

	.offer .muted,
	.share-note {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.share-note {
		margin: 0;
	}

	.marks.drawing {
		pointer-events: auto;
		touch-action: none;
		cursor: crosshair;
	}

	.note {
		color: var(--text-muted);
	}

	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	@media (max-width: 560px) {
		.swatch .label {
			display: none;
		}

		/* A phone: the toolbar's buttons a little smaller, so it stays one or two slim rows. */
		.tool,
		.swatch {
			min-width: 34px;
			height: 34px;
			padding: 0 var(--space-2);
			font-size: var(--text-xs);
		}

		.pages {
			min-width: 6em;
			font-size: var(--text-xs);
		}
	}
</style>
