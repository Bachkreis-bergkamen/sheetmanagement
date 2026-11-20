<script lang="ts">
	import { showToast, toast } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import type { OpenScore } from '#lib/music/score-reader.ts';
	import { FloatingBar } from '#lib/practice/floating-bar.svelte.ts';
	import { MARK_COLORS, MARK_SYMBOLS, markLines, onPage, strokePath, SYMBOL_SIZE, symbolLines, type MarkColor, type MarkSymbol, type Stroke } from '#lib/practice/marks.ts';
	import { OpenTools } from '#lib/practice/open-tools.svelte.ts';
	import { pageKey } from '#lib/practice/page-keys.ts';
	import { PageMarks } from '#lib/practice/page-marks.svelte.ts';
	import { MAX_ZOOM, PageZoom, ZOOM_STEP } from '#lib/practice/page-zoom.svelte.ts';
	import { Pen } from '#lib/practice/pen.svelte.ts';
	import { ASIDE, dockFor, fitted as fitTo, lying, PANEL, pileFor } from '#lib/practice/score-layout.ts';
	import { SectionOffers, type Offer } from '#lib/practice/section-offers.svelte.ts';
	import { nudged, ToolSpots, type Spot } from '#lib/practice/tool-spots.svelte.ts';
	import { keptPages, sendPending } from '#lib/offline/marks.ts';
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
		print: printable = true,
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
		/** The "Drucken" button (#362); off in the concert mode. */
		print?: boolean;
		/** The page shown, e.g. for a report about it (#306). */
		page?: number;
	} = $props();

	/** The tool shown; tools once opened stay mounted (see OpenTools). */
	const toolbox = new OpenTools();

	let score = $state<OpenScore | null>(null);
	let pages = $state(0);
	let failed = $state(false);

	/** Printing (#362): every page with the member's marks, through the system's print dialogue. */
	let printing = $state(false);
	async function print() {
		if (!score || printing) return;
		printing = true;
		try {
			// The stroke being drawn belongs on the paper too.
			pen.finish();
			const { printScore } = await import('#lib/practice/print.ts');
			await printScore(score, own.marks, (number, of) => showToast(t.practice.viewer.printing(number, of), 30_000));
			toast.message = null;
		} catch (error) {
			console.error(error);
			showToast(t.practice.viewer.printFailed);
		} finally {
			printing = false;
		}
	}
	let fit = $state<'page' | 'width'>('page');
	let full = $state(false);
	let root = $state<HTMLDivElement>();
	let stage = $state<HTMLDivElement>();
	let slot = $state<HTMLDivElement>();
	let stageWidth = $state(0);
	let stageHeight = $state(0);
	/** The current page's size fitted to the screen, before zooming. */
	let fittedSize = $state<{ width: number; height: number } | null>(null);
	/** Shown at `zoom.level`, drawn at `zoom.drawn` once a pinch rests (see PageZoom). */
	const zoom = new PageZoom();
	/** The current page's size on screen. */
	const size = $derived(fittedSize && { width: Math.round(fittedSize.width * zoom.level), height: Math.round(fittedSize.height * zoom.level) });
	let sheet = $state<HTMLDivElement>();
	let pileBox = $state<HTMLDivElement>();
	/** The page can be scrolled: at its width, or zoomed in. */
	const scrolls = $derived(fit === 'width' || zoom.zoomed);
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
		return fitTo(base, fit, stageWidth, height);
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
		const [current, number, mode, scale] = [score, page, fit, zoom.drawn];
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
				if (turned) turnLeaf();
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

	/** The other pages, as a loose pile of paper under this one (see pileFor). */
	const underneath = $derived(score && !scrolls ? pileFor(page, pages) : []);

	let leaf: { ghost: HTMLElement; from: number; to: number } | null = null;
	let leafing: Animation[] = [];

	/** A copy of the page being turned away, with its marks; not while zoomed or for those who'd rather have no motion. */
	function liftLeaf(from: number, to: number) {
		leaf = null;
		if (!sheet || zoom.zoomed || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const old = slot?.querySelector('canvas');
		if (!old || !old.width) return;
		const ghost = document.createElement('div');
		ghost.className = 'leaf';
		const copy = document.createElement('canvas');
		copy.width = old.width;
		copy.height = old.height;
		copy.getContext('2d')?.drawImage(old, 0, 0);
		ghost.append(copy);
		const drawnMarks = sheet.querySelector('svg.marks');
		if (drawnMarks) ghost.append(drawnMarks.cloneNode(true));
		leaf = { ghost, from, to };
	}

	function turnLeaf() {
		const lifted = leaf;
		leaf = null;
		for (const running of leafing) running.finish();
		leafing = [];
		if (!lifted || !sheet || !pileBox) return;
		const { ghost, from, to } = lifted;
		pileBox.append(ghost);
		const stack = scrolls ? [] : pileFor(to, pages);
		const at = (number: number) => stack.find((under) => under.number === number);
		// Where the new page lay before: in the pile under the old one.
		const was = pileFor(from, pages).find((under) => under.number === to) ?? { number: to, behind: to < from, depth: 3 };
		const timing = { duration: 480, easing: 'cubic-bezier(0.33, 0, 0.25, 1)' };
		if (to > from) {
			// On: the old page is pulled aside and slid under the pile, the next one straightens up.
			const rest = at(from);
			leafing.push(
				ghost.animate(
					[
						{ transform: 'none', zIndex: 6, opacity: 1 },
						{ transform: ASIDE, zIndex: 6, opacity: 1, offset: 0.46 },
						{ transform: ASIDE, zIndex: 0, opacity: 1, offset: 0.5 },
						{ transform: rest ? lying(rest) : 'none', zIndex: 0, opacity: rest ? 1 : 0 }
					],
					{ ...timing, fill: 'forwards' }
				),
				sheet.animate([{ transform: lying(was) }, { transform: 'none' }], { ...timing, duration: 360, delay: 120, fill: 'backwards' })
			);
		} else {
			// Back: the sheet at the back is pulled out and laid on top; the old page settles under it.
			const settled = at(from);
			leafing.push(
				ghost.animate([{ transform: 'none' }, { transform: settled ? lying(settled) : 'none', opacity: settled ? 1 : 0 }], { ...timing, fill: 'forwards' }),
				sheet.animate(
					[
						{ transform: lying(was), zIndex: 0 },
						{ transform: ASIDE, zIndex: 0, offset: 0.46 },
						{ transform: ASIDE, zIndex: 7, offset: 0.5 },
						{ transform: 'none', zIndex: 7 }
					],
					timing
				)
			);
		}
		const [first] = leafing;
		const done = () => ghost.remove();
		first.onfinish = done;
		first.oncancel = done;
	}

	function turn(step: number) {
		const next = Math.min(pages, Math.max(1, page + step));
		if (next !== page) {
			pen.finish();
			flushSync();
			liftLeaf(page, next);
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

	function onkeydown(event: KeyboardEvent) {
		const action = pageKey({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, target: event.target as HTMLElement | null }, full);
		if (action === 'leave') return void leaveFull();
		if (action === 'forward') forward();
		else if (action === 'back') back();
		else if (action === 'first') turn(-pages);
		else if (action === 'last') turn(pages);
		else return;
		event.preventDefault();
	}

	/** Tapping the left half goes back, the right half forward; not while drawing or zoomed in. */
	function onstageclick(event: MouseEvent) {
		if (pen.on || zoom.zoomed || !stage) return;
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
	function zoomTo(next: number, point?: { x: number; y: number }, fraction?: { x: number; y: number }) {
		if (!stage || !sheet) return;
		const area = stage.getBoundingClientRect();
		const at = point ?? { x: area.left + area.width / 2, y: area.top + area.height / 2 };
		const before = sheet.getBoundingClientRect();
		const spot = fraction ?? { x: (at.x - before.left) / before.width, y: (at.y - before.top) / before.height };
		if (zoom.set(next)) flushSync();
		const after = sheet.getBoundingClientRect();
		stage.scrollLeft += after.left + spot.x * after.width - at.x;
		stage.scrollTop += after.top + spot.y * after.height - at.y;
	}

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
			pen.dropTouch();
			const rect = sheet.getBoundingClientRect();
			const at = middle(event.touches);
			pinch = { distance: distance(event.touches), zoom: zoom.level, spot: { x: (at.x - rect.left) / rect.width, y: (at.y - rect.top) / rect.height } };
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
			zoomTo(zoom.level * Math.exp(-event.deltaY / 200), { x: event.clientX, y: event.clientY });
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

	// The pen: the member's marks, saved a moment after it stops (see PageMarks).
	const own = new PageMarks(() => file);
	$effect.pre(() => {
		own.marks = { ...saved };
	});
	// What this device drew and the server hasn't got (or, offline, a page kept days ago doesn't show).
	$effect(() => {
		const server = saved;
		let stale = false;
		keptPages(file).then((kept) => {
			if (!stale) own.merge(server, kept, navigator.onLine);
		});
		return () => (stale = true);
	});
	// Back online: what was drawn offline goes to the server.
	$effect(() => {
		const online = () => sendPending().then(() => own.sent());
		if (navigator.onLine) online();
		addEventListener('online', online);
		return () => removeEventListener('online', online);
	});
	/** The colour and tool, and the one pointer drawing (see Pen). */
	const pen = new Pen(own, () => page);
	const current = $derived(own.on(page));
	/** How full the page is, 0 to 1. */
	const fullness = $derived(own.fullness(page));

	// Sharing with the section: the member's own offer, and the offers of others (see SectionOffers).
	const section = new SectionOffers(own, () => file);
	$effect.pre(() => section.reset(sharedAt, offers));
	/** The offered marks shown on this page, to be taken over with a tap. */
	const offered = $derived(section.offered(page));
	function share() {
		if (confirm(t.practice.share.confirm)) section.share();
	}
	function unshare() {
		if (confirm(t.practice.share.confirmUnshare)) section.unshare();
	}

	// Leaving the page: what's still waiting goes out now.
	$effect(() => () => own.leave());

	function point(event: PointerEvent, element: Element): [number, number] {
		const rect = element.getBoundingClientRect();
		return [onPage((event.clientX - rect.left) / rect.width), onPage((event.clientY - rect.top) / rect.height)];
	}

	function down(event: PointerEvent) {
		if (!pen.on || pinch) return;
		event.preventDefault();
		const element = event.currentTarget as Element;
		if (!pen.down({ id: event.pointerId, type: event.pointerType, at: point(event, element) })) return;
		// Keeps the line going past the page's edge; a browser that won't still draws on the page.
		try {
			element.setPointerCapture(event.pointerId);
		} catch {
			// Drawn without capture.
		}
	}
	function move(event: PointerEvent) {
		if (pinch) return;
		const element = event.currentTarget as Element;
		// Pens report many points between frames; all of them make a smoother line.
		const coalesced = event.getCoalescedEvents?.();
		const events = coalesced?.length ? coalesced : [event];
		pen.move(event.pointerId, [...events.slice(0, -1), event].map((each) => point(each, element)));
	}
	function lift(event: PointerEvent) {
		pen.lift(event.pointerId);
	}

	function undo() {
		own.undo(page);
	}

	function clear() {
		if (!current.length || !confirm(t.practice.marks.confirmClear)) return;
		own.change(page, []);
	}

	/**
	 * In full screen the controls float over the page, so it gets the whole height, and fade
	 * away when quiet (see FloatingBar). Not while drawing or answering an offer: those bars stay
	 * put above the page. A page narrower than the screen is tall, so it often leaves a strip
	 * free below it: where the bar fits in the free height, it stays in view and the page makes
	 * room for it, above or below.
	 */
	let controlsBox = $state<HTMLDivElement>();
	const floating = $derived(full && !pen.on && !(penAllowed && section.offer) && !section.note);
	let controlsHeight = $state(0);
	const spare = $derived(full && size && !scrolls ? stageHeight - size.height : 0);
	const roomy = $derived(floating && controlsHeight > 0 && spare >= controlsHeight);
	const bar = new FloatingBar(() => ({ floating, roomy, focused: !!controlsBox?.querySelector(':focus-visible') }));
	function hideControls() {
		(document.activeElement as HTMLElement | null)?.blur?.();
		bar.hide();
	}
	$effect(() => {
		bar.follow();
		return () => bar.stop();
	});
	function onrootmove(event: PointerEvent) {
		if (floating && event.pointerType === 'mouse') bar.wake();
	}

	/**
	 * Where the tools go (see dockFor). Decided by the page as it is without the tools: in full
	 * screen, tools above the page make it smaller, and the smaller page mustn't then send them
	 * beside it, and back (#239).
	 */
	const dock = $derived.by(() => {
		const room = full && areaHeight ? areaHeight : stageHeight;
		return dockFor({ fit, stageWidth, stageHeight, room, whole: base ? fitted(base, room) : size, size });
	});
	// The tools where the player put them (#248; see ToolSpots): apart for portrait, landscape and full screen.
	let windowWidth = $state(0);
	let windowHeight = $state(0);
	let areaWidth = $state(0);
	let dockWidth = $state(0);
	let dockHeight = $state(0);
	let dockBox = $state<HTMLDivElement>();
	let areaBox = $state<HTMLDivElement>();
	const layout = $derived(`${full ? 'full' : 'page'}-${windowWidth > windowHeight ? 'landscape' : 'portrait'}`);
	const placed = new ToolSpots(() => ({ layout, areaWidth, areaHeight, dockWidth, dockHeight }));
	const spot = $derived(placed.spot);
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
		placed.place({ x: drag.from.x + dx, y: drag.from.y + dy }, false);
	}
	function drop(event: PointerEvent) {
		if (drag?.id !== event.pointerId) return;
		const moved = drag.moved;
		drag = null;
		if (moved) return placed.place(placed.snap(spot ?? spotNow()), true);
		// A double tap, also by finger, where dblclick doesn't come: back to automatic.
		if (event.timeStamp - lastTap < 350) placed.place(null, true);
		lastTap = event.timeStamp;
	}
	function nudge(event: KeyboardEvent) {
		const to = nudged(spotNow(), event.key, event.shiftKey);
		if (to === undefined) return;
		placed.place(to, true);
		// Not a page turn, and not leaving full screen.
		event.preventDefault();
		event.stopPropagation();
	}

	/** The page's left edge in the stage: centred, or moved aside for the docked tools. */
	const pageLeft = $derived(toolbox.active && !spot ? dock.page : Math.max(0, ((size ? stageWidth - size.width : 0) / 2)));

	const STROKE: Record<MarkColor, string> = { graphite: 'var(--mark-graphite)', red: 'var(--mark-red)', blue: 'var(--mark-blue)' };
	/** A symbol's button: its glyph in a 24 × 24 box, 10 to a symbol unit. */
	const preview = (symbol: MarkSymbol) => symbolLines(symbol, 0, 0, 1).map((line) => strokePath(line.map((n) => 12 + (n / SYMBOL_SIZE) * 10), 1, 1));
	const strokeWidth = $derived(Math.max(1.5, (size?.width ?? 600) * 0.0032));
</script>

<svelte:window {onkeydown} bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} />

<!-- In full screen the controls float over the page's top and fade away; the page gets the whole height.
     The pointer handlers here and on .controls only wake the controls; keyboard users get them through focusin. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="score" class:full class:night bind:this={root} onpointermove={onrootmove}>
	{#if floating && bar.bare}
		<button type="button" class="reveal" class:below={bar.below} onclick={() => bar.wake()} aria-label={t.practice.viewer.showControls} title={t.practice.viewer.showControls}><Icon name="menu" size={18} /></button>
	{/if}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="controls" class:floating class:below={full && bar.below} class:bare={floating && bar.bare} bind:this={controlsBox} bind:offsetHeight={controlsHeight} onfocusin={() => floating && bar.wake()} onpointerdown={() => floating && bar.wake()} onpointerenter={(event) => (bar.mouseOver = event.pointerType === 'mouse')} onpointerleave={() => (bar.mouseOver = false)} inert={floating && bar.bare}>
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
				<button type="button" class="tool" onclick={() => zoomTo(zoom.level / ZOOM_STEP)} disabled={!zoom.zoomed} aria-label={t.practice.viewer.zoomOut}><Icon name="minus" size={16} /></button>
				<button type="button" class="tool text percent" onclick={() => zoomTo(1)} disabled={!zoom.zoomed} aria-label={t.practice.viewer.zoomReset}>{Math.round(zoom.level * 100)} %</button>
				<button type="button" class="tool" onclick={() => zoomTo(zoom.level * ZOOM_STEP)} disabled={zoom.level >= MAX_ZOOM} aria-label={t.practice.viewer.zoomIn}><Icon name="plus" size={16} /></button>
			</span>
			{#if penAllowed}
				<button type="button" class="tool text" class:on={pen.on} aria-pressed={pen.on} onclick={() => pen.toggle()}>
					<Icon name="edit" size={15} />{t.practice.marks.pen}
				</button>
			{/if}
			{#each tools as each (each.value)}
				<button type="button" class="tool text" class:on={toolbox.active === each.value} aria-expanded={toolbox.active === each.value} onclick={() => toolbox.choose(each.value)}>
					{each.label}
				</button>
			{/each}
			<button type="button" class="tool text" onclick={() => (full ? leaveFull() : enterFull())} aria-pressed={full}>
				{full ? t.practice.viewer.exitFullscreen : t.practice.viewer.fullscreen}
			</button>
			{#if printable}
				<button type="button" class="tool" onclick={print} disabled={!score || printing} aria-busy={printing} aria-label={t.practice.viewer.print} title={t.practice.viewer.print}><Icon name="print" size={16} /></button>
			{/if}
			{#if full}
				<button type="button" class="tool" onclick={() => bar.move()} aria-label={bar.below ? t.practice.viewer.barTop : t.practice.viewer.barBottom} title={bar.below ? t.practice.viewer.barTop : t.practice.viewer.barBottom}><Icon name={bar.below ? 'barTop' : 'barBottom'} size={16} /></button>
			{/if}
			{#if floating && !roomy}
				<button type="button" class="tool" onclick={hideControls} aria-label={t.practice.viewer.hideControls} title={t.practice.viewer.hideControls}><Icon name={bar.below ? 'down' : 'up'} size={16} /></button>
			{/if}
		</div>
	</div>

	{#if pen.on}
		<div class="bar pen" role="toolbar" aria-label={t.practice.marks.title}>
			<div class="group">
				{#each MARK_COLORS as each (each)}
					<button
						type="button"
						class="swatch {each}"
						class:on={pen.ink === each && pen.tool !== 'eraser'}
						aria-pressed={pen.ink === each && pen.tool !== 'eraser'}
						onclick={() => pen.pick(each)}
						title={t.practice.marks[each]}
					>
						<span class="dot"></span><span class="label">{t.practice.marks[each]}</span>
					</button>
				{/each}
				<button type="button" class="tool text" class:on={pen.tool === 'eraser'} aria-pressed={pen.tool === 'eraser'} onclick={() => pen.choose('eraser')}>{t.practice.marks.eraser}</button>
			</div>
			<!-- Symbols: a tap on the page places one; they hardly fill the page, as lines do. -->
			<div class="group symbols" role="group" aria-label={t.practice.marks.symbolsTitle}>
				{#each MARK_SYMBOLS as each (each)}
					<button
						type="button"
						class="tool symbol {pen.ink}"
						class:on={pen.tool === each}
						aria-pressed={pen.tool === each}
						onclick={() => pen.choose(each)}
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
					<button type="button" class="tool text" class:on={!!section.shared} aria-pressed={!!section.shared} onclick={() => (section.shared ? unshare() : share())}>
						<Icon name="users" size={15} />{section.shared ? t.practice.share.unshare : t.practice.share.share}
					</button>
				{/if}
				<span class="state" class:failed={own.saving === 'failed' || own.refused} role="status">
					{own.refused
						? t.practice.marks.pageFull
						: own.saving === 'saving'
							? t.practice.marks.saving
							: own.saving === 'failed'
								? t.practice.marks.failed(own.failure)
								: own.saving === 'queued'
									? t.practice.marks.queued
								: fullness > 0.8
									? t.practice.marks.nearlyFull
									: own.saving === 'saved'
										? t.practice.marks.saved
										: section.shared
											? t.practice.marks.sharedNote
											: t.practice.marks.private}
				</span>
			</div>
		</div>
	{/if}

	<!-- An offer from the section: above the page like the rest, never over it. -->
	{#if penAllowed && section.offer}
		<div class="bar offer" role="region" aria-label={t.practice.marks.title}>
			<p>
				<Icon name="users" size={15} />{t.practice.share.offered(section.offer.from, section.count + section.picked)}
				{#if section.reviewing}<span class="muted">{t.practice.share.pick} {t.practice.share.onPage(offered.length)}</span>{/if}
			</p>
			<div class="group">
				<button type="button" class="tool text" class:on={section.reviewing} aria-pressed={section.reviewing} onclick={() => (section.reviewing ? (section.reviewing = false) : (pen.stop(), (section.reviewing = true)))}>
					{section.reviewing ? t.practice.share.hide : t.practice.share.show}
				</button>
				<button type="button" class="tool text" onclick={() => section.answer('all')}>{t.practice.share.takeAll}</button>
				{#if section.picked}
					<button type="button" class="tool text" onclick={() => section.answer('some')}>{t.practice.share.done}</button>
				{:else}
					<button type="button" class="tool text" onclick={() => section.answer('declined')}>{t.practice.share.decline}</button>
				{/if}
			</div>
		</div>
	{/if}
	{#if section.note}<p class="share-note" role="status">{section.note}</p>{/if}
	</div>

	<div class="area" class:docked={!!toolbox.active} bind:this={areaBox} bind:clientHeight={areaHeight} bind:clientWidth={areaWidth}>
	<!-- The tools: rendered once, so a running metronome or drone carries on when the panel moves, folds or closes. -->
	{#if panel && toolbox.opened.length}
		<div
			class="dock {spot ? 'free' : dock.place}"
			class:folded={spot && placed.folded}
			hidden={!toolbox.active}
			bind:this={dockBox}
			bind:offsetWidth={dockWidth}
			bind:offsetHeight={dockHeight}
			style:top={spot ? `${spot.y}px` : dock.top}
			style:left={spot ? `${spot.x}px` : dock.left}
			style:width={spot ? (placed.folded ? undefined : `${Math.min(PANEL + 40, areaWidth)}px`) : dock.width}
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
				{#if spot && placed.folded}
					<button type="button" class="pill" onclick={() => (placed.folded = false)} aria-expanded="false">{tools.find((each) => each.value === toolbox.active)?.label}</button>
				{:else if spot}
					<button type="button" class="icon" onclick={() => (placed.folded = true)} aria-expanded="true" aria-label={t.practice.viewer.fold} title={t.practice.viewer.fold}><Icon name="minus" size={16} /></button>
					<button type="button" class="icon" onclick={() => placed.place(null, true)} aria-label={t.practice.viewer.autoPlace} title={t.practice.viewer.autoPlace}><Icon name="refresh" size={16} /></button>
				{/if}
				{#if !(spot && placed.folded)}
					<button type="button" class="close" onclick={() => toolbox.close()} aria-label={t.practice.viewer.closeTools}>×</button>
				{/if}
			</div>
			<div class="panels" hidden={!!spot && placed.folded}>
				{#each toolbox.opened as tool (tool)}
					<div class="tool-panel" hidden={toolbox.active !== tool}>{@render panel(tool)}</div>
				{/each}
			</div>
		</div>
	{/if}
	<p class="sr-only" role="status">{placed.note}</p>

	<!-- Taps on the page turn it; the keys and pedals work anywhere on the page. -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="stage" class:width={fit === 'width'} class:zoomed={zoom.zoomed} bind:this={stage} bind:clientWidth={stageWidth} bind:clientHeight={stageHeight} onclick={onstageclick}>
		{#if failed}
			<p class="msg error">{t.practice.viewer.failed}</p>
		{:else if !score}
			<p class="note">{t.viewer.loading}</p>
		{/if}
		<div
			class="pile"
			bind:this={pileBox}
			style:width={size ? `${size.width}px` : undefined}
			style:height={size ? `${size.height}px` : undefined}
			style:margin-left={size ? `${pageLeft}px` : undefined}
			style:margin-top={roomy && !bar.below ? `${controlsHeight}px` : undefined}
			hidden={!score || failed}
		>
		{#each underneath as under (under.number)}
			<div class="under" style:transform={lying(under)} style:z-index={4 - under.depth}></div>
		{/each}
		<div class="sheet" bind:this={sheet}>
			<div class="slot" bind:this={slot}></div>
			{#if size}
				<svg
					class="marks"
					class:drawing={pen.on}
					viewBox="0 0 {size.width} {size.height}"
					width={size.width}
					height={size.height}
					onpointerdown={down}
					onpointermove={move}
					onpointerup={lift}
					onpointercancel={lift}
					aria-hidden={offered.length ? undefined : 'true'}
				>
					{#each [...current, ...(pen.drawing ? [pen.drawing] : [])] as stroke, i (i)}
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
							onclick={(event) => (event.stopPropagation(), section.take(page, i))}
							onkeydown={(event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), event.stopPropagation(), section.take(page, i))}
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

	/* Full screen: the bar over the page's top, fading away when quiet. */
	.controls.floating {
		position: absolute;
		top: env(safe-area-inset-top);
		left: env(safe-area-inset-left);
		right: env(safe-area-inset-right);
		z-index: 5;
		padding: var(--space-2);
		background: color-mix(in srgb, var(--bg) 92%, transparent);
		box-shadow: var(--shadow);
		transition:
			opacity 0.25s ease,
			transform 0.25s ease;
	}

	.controls.floating.bare {
		opacity: 0;
		transform: translateY(-100%);
		pointer-events: none;
	}

	/* The bar at the bottom, where the player put it. */
	.controls.floating.below {
		top: auto;
		bottom: env(safe-area-inset-bottom);
	}

	.controls.floating.below.bare {
		transform: translateY(100%);
	}

	.full .controls.below {
		order: 1;
		border-top: 1px solid var(--hairline);
		border-bottom: 0;
	}

	/* The way back to the hidden bar: small and faint, in the top corner. */
	.reveal {
		position: absolute;
		top: calc(env(safe-area-inset-top) + var(--space-2));
		right: calc(env(safe-area-inset-right) + var(--space-2));
		z-index: 6;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 1px solid var(--hairline);
		border-radius: 50%;
		background: var(--surface);
		color: var(--text-muted);
		opacity: 0.55;
		cursor: pointer;
	}

	.reveal.below {
		top: auto;
		bottom: calc(env(safe-area-inset-bottom) + var(--space-2));
	}

	.reveal:hover,
	.reveal:focus-visible {
		opacity: 1;
	}

	/* Night: the page inverted, light notes on black, for a dark stage. */
	.score.night.full {
		background: var(--brand-ink);
	}

	.night .pile {
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

	/* The page and the loose pile of paper under it (see pileFor); the page keeps exactly the size it was fitted to. */
	/* Its own layers: the sheets' z-indexes stay inside it, under the floating bar. */
	.pile {
		position: relative;
		isolation: isolate;
		--paper: #fff;
		--paper-under: #f7f5ef;
		--paper-edge: rgba(40, 30, 10, 0.16);
	}

	.sheet {
		position: relative;
		z-index: 5;
		width: 100%;
		height: 100%;
		background: var(--paper);
		box-shadow: 0 0 0 1px var(--paper-edge), 0 2px 6px rgba(40, 30, 10, 0.08), 0 10px 24px -10px rgba(40, 30, 10, 0.22);
	}

	.under {
		position: absolute;
		inset: 0;
		background: var(--paper-under);
		box-shadow: 0 0 0 1px var(--paper-edge), 0 1px 3px rgba(40, 30, 10, 0.1);
		transition: transform 320ms cubic-bezier(0.33, 0, 0.25, 1);
		pointer-events: none;
	}

	/* A page on its way to or from the back of the pile (see turnLeaf). */
	.pile :global(.leaf) {
		position: absolute;
		inset: 0;
		z-index: 6;
		background: var(--paper);
		box-shadow: 0 0 0 1px var(--paper-edge), 0 14px 32px -8px rgba(40, 30, 10, 0.3);
		pointer-events: none;
		will-change: transform;
	}

	.pile :global(.leaf canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}

	@media (prefers-reduced-motion: reduce) {
		.under {
			transition: none;
		}
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
