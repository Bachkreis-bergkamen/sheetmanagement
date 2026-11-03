import type { Page } from '@playwright/test';
import { PDFArray, PDFDocument } from '@cantoo/pdf-lib';
import { expect, expectAccessible, open, resetDemo, test } from './demo.ts';

/** The practice viewer: a member's own part page by page, with their notes, metronome and tuner. */
test.beforeEach(async ({ page }) => resetDemo(page, 'mitglied'));

const PART = '/ueben/demo-egmont-9';

/**
 * A line with the pen, from and to points relative to the page (past 1 is past its edge): by
 * touch on the phone, as fingers and pencils send it, with the mouse on the desktop.
 */
async function draw(page: Page, from: [number, number], to: [number, number]) {
	const box = (await page.locator('svg.marks').boundingBox())!;
	const at = ([x, y]: [number, number]) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
	const steps = Array.from({ length: 9 }, (_, i) => at([from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8]));
	if (test.info().project.name === 'phone') {
		await page.locator('svg.marks').evaluate((svg, points) => {
			const send = (type: string, point: { x: number; y: number }) =>
				svg.dispatchEvent(
					new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, buttons: type === 'pointerup' ? 0 : 1, clientX: point.x, clientY: point.y })
				);
			send('pointerdown', points[0]);
			for (const point of points.slice(1)) send('pointermove', point);
			send('pointerup', points.at(-1)!);
		}, steps);
		return;
	}
	await page.mouse.move(steps[0].x, steps[0].y);
	await page.mouse.down();
	for (const step of steps.slice(1)) await page.mouse.move(step.x, step.y);
	await page.mouse.up();
}

/** One of the tools behind the toolbar's "Werkzeuge": the panel opened, on that tool's tab. */
async function tool(page: Page, name: 'Metronom' | 'Stimmgerät' | 'Liegeton') {
	if (!(await page.locator('.dock').isVisible())) await page.getByRole('button', { name: 'Werkzeuge' }).click();
	await page.locator('.dock .tabs').getByRole('button', { name }).click();
}

test('Meine Noten opens the part in the practice viewer, which draws it', async ({ page }) => {
	await open(page, '/meine-noten');
	await expect(page.locator('a.part').first()).toHaveAttribute('href', /^\/ueben\//);
	await open(page, PART);
	await expect(page.locator('.slot canvas')).toHaveCount(1);
	await expect(page.getByText('Seite 1 von 1')).toBeVisible();
	await expect(page.getByText(/Zählt als Probenzeit/)).toBeVisible();
	await expectAccessible(page);
});

test('two fingers zoom the page, keeping the music under them, and the buttons zoom too', async ({ page }) => {
	await open(page, PART);
	await expect(page.locator('.slot canvas')).toHaveCount(1);
	const stage = page.locator('.stage');
	const stageWidth = (await stage.boundingBox())!.width;
	const drawnBefore = await page.locator('.slot canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width);

	// Fingers 60 px apart at three quarters across the page, spread to 120 px: twice the size.
	const result = await stage.evaluate((element) => {
		const sheet = element.querySelector('.sheet')!;
		const box = sheet.getBoundingClientRect();
		const x = box.left + box.width * 0.75;
		const y = box.top + Math.min(box.height, element.clientHeight) / 3;
		const spot = { x: (x - box.left) / box.width, y: (y - box.top) / box.height };
		const touches = (gap: number) => [new Touch({ identifier: 1, target: element, clientX: x - gap / 2, clientY: y }), new Touch({ identifier: 2, target: element, clientX: x + gap / 2, clientY: y })];
		const send = (type: string, list: Touch[]) => element.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: list, targetTouches: list, changedTouches: list }));
		const browserZoomStopped = !send('touchstart', touches(60));
		for (let gap = 70; gap <= 120; gap += 10) send('touchmove', touches(gap));
		send('touchend', []);
		const after = sheet.getBoundingClientRect();
		return {
			browserZoomStopped,
			spot,
			now: { x: (x - after.left) / after.width, y: (y - after.top) / after.height },
			// Only a page larger than its frame can scroll to keep the spot; a smaller one stays centred.
			overflows: { x: after.width > element.clientWidth, y: after.height > element.clientHeight }
		};
	});
	expect(result.browserZoomStopped).toBe(true);
	await expect(page.locator('.zoom .percent')).toHaveText('200 %');
	if (result.overflows.x) expect(result.now.x).toBeCloseTo(result.spot.x, 2);
	if (result.overflows.y) expect(result.now.y).toBeCloseTo(result.spot.y, 2);
	expect(result.overflows.x || result.overflows.y).toBe(true);
	// The page scrolls inside its frame instead of widening it, and is drawn sharp at the new size.
	expect((await stage.boundingBox())!.width).toBe(stageWidth);
	await expect.poll(() => page.locator('.slot canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(drawnBefore);

	await page.getByRole('button', { name: 'Vergrößern' }).click();
	await expect(page.locator('.zoom .percent')).toHaveText('250 %');
	await page.getByRole('button', { name: 'Zurück auf 100 %' }).click();
	await expect(page.locator('.zoom .percent')).toHaveText('100 %');
	await expect(page.getByRole('button', { name: 'Verkleinern' })).toBeDisabled();
});

test('a second finger turns a line being drawn into a zoom, without leaving a mark', async ({ page }) => {
	await open(page, PART);
	await expect(page.locator('.slot canvas')).toHaveCount(1);
	await page.getByRole('button', { name: 'Stift' }).click();
	await page.locator('svg.marks').evaluate((svg) => {
		const stage = svg.closest('.stage')!;
		const box = svg.getBoundingClientRect();
		const [x, y] = [box.left + box.width / 2, box.top + box.height / 4];
		const pointer = (type: string, dx: number) =>
			svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 3, pointerType: 'touch', isPrimary: true, buttons: 1, clientX: x + dx, clientY: y }));
		pointer('pointerdown', 0);
		pointer('pointermove', 10);
		const touches = (gap: number) => [new Touch({ identifier: 1, target: svg, clientX: x + 10, clientY: y }), new Touch({ identifier: 2, target: svg, clientX: x + 10 + gap, clientY: y })];
		const send = (type: string, list: Touch[]) => stage.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: list, targetTouches: list, changedTouches: list }));
		send('touchstart', touches(50));
		pointer('pointermove', 20);
		send('touchmove', touches(100));
		send('touchend', []);
		pointer('pointerup', 20);
	});
	await expect(page.locator('.zoom .percent')).toHaveText('200 %');
	await expect(page.locator('svg.marks path')).toHaveCount(0);
});

test('the page draws without JavaScript Safari and Android Chrome lack', async ({ page }) => {
	// pdf.js 6's modern build needs these; its legacy build, which the app loads, doesn't.
	await page.addInitScript(() => {
		const gone = [
			[Math, 'sumPrecise'],
			[Promise, 'try'],
			[Map.prototype, 'getOrInsert'],
			[Map.prototype, 'getOrInsertComputed'],
			[WeakMap.prototype, 'getOrInsert'],
			[WeakMap.prototype, 'getOrInsertComputed'],
			[Uint8Array, 'fromBase64'],
			[Uint8Array.prototype, 'toHex']
		] as const;
		for (const [owner, name] of gone) delete (owner as unknown as Record<string, unknown>)[name];
	});
	await open(page, PART);
	await expect(page.locator('.slot canvas')).toHaveCount(1);
	await expect(page.locator('.score .msg.error')).toHaveCount(0);
});

test('a pen mark is saved and still there after reloading, only for its member', async ({ page }) => {
	await open(page, PART);
	await expect(page.locator('.slot canvas')).toHaveCount(1);
	await page.getByRole('button', { name: 'Stift' }).click();
	await page.getByRole('button', { name: 'Rot' }).click();
	const saved = page.waitForResponse((response) => response.url().endsWith('/api/ueben/notizen') && response.request().method() === 'PUT');
	await draw(page, [0.3, 0.3], [0.5, 0.35]);
	expect((await saved).status()).toBe(204);
	await expect(page.getByText('Gespeichert')).toBeVisible();
	// A line drawn past the page's edge is kept too, ending at the edge.
	const again = page.waitForResponse((response) => response.url().endsWith('/api/ueben/notizen') && response.request().method() === 'PUT');
	await draw(page, [0.8, 0.6], [1.3, 0.7]);
	expect((await again).status()).toBe(204);

	await open(page, PART);
	await expect(page.locator('svg.marks path')).toHaveCount(2);
	// In the member's own data export, and on their profile with a button to delete them all.
	await open(page, '/profil');
	await expect(page.getByText('Notizen in deinen Noten')).toBeVisible();

	// Someone else (the demo admin, who plays nothing) can't save marks in that part.
	const origin = new URL(page.url()).origin;
	await page.request.post('/demo', { form: { rolle: 'verwaltung', weiter: '/' }, headers: { origin }, maxRedirects: 0 });
	const refused = await page.request.put('/api/ueben/notizen', { data: { file: 'demo-egmont-9', page: 1, strokes: [] } });
	expect(refused.status()).toBe(404);
});

test('the tuner names a soft note and how far off it is', async ({ page }) => {
	// Instead of the microphone, an A at 440 Hz, as soft as a phone picks up a violin a metre away.
	await page.addInitScript(() => {
		navigator.mediaDevices.getUserMedia = async () => {
			const context = new AudioContext();
			const tone = context.createOscillator();
			tone.frequency.value = 440;
			const gain = context.createGain();
			gain.gain.value = 0.01;
			// The test can stop playing (gain 0) to see the reading held.
			(window as unknown as { testTone: GainNode }).testTone = gain;
			const out = context.createMediaStreamDestination();
			tone.connect(gain).connect(out);
			tone.start();
			return out.stream;
		};
	});
	await open(page, PART);
	await tool(page, 'Stimmgerät');
	await page.getByRole('button', { name: 'Mikrofon einschalten' }).click();
	const reading = page.locator('.tuner .reading');
	await expect(reading).toContainText('A4');
	await expect(reading).toContainText('Stimmt');
	// Within 0.2 Hz (under a cent): audio stacks differ a little in what an oscillator gives.
	await expect(reading).toContainText(/(439,[89]|440,[012]) Hz/);
	// Tuned to 442 Hz, the same A is 8 cents flat.
	await page.getByRole('spinbutton', { name: 'Kammerton a′' }).fill('442');
	await expect(reading).toContainText('−8 Cent · zu tief');
	// A pause: the last reading stays, marked as such.
	await page.evaluate(() => ((window as unknown as { testTone: GainNode }).testTone.gain.value = 0));
	await expect(reading).toContainText('zuletzt gehört');
	await expect(reading).toContainText('A4');
	// Stopped, it still shows what it heard last.
	await page.getByRole('button', { name: 'Beenden' }).click();
	await expect(page.getByRole('button', { name: 'Mikrofon einschalten' })).toBeVisible();
	await expect(reading).toContainText('zuletzt gehört');

	// The drone, a tab of its own, on the note the tuner heard last.
	await tool(page, 'Liegeton');
	await page.getByRole('button', { name: 'Gehörten Ton nehmen' }).click();
	await page.getByRole('button', { name: 'A4 spielen' }).click();
	await expect(page.getByRole('button', { name: 'Liegeton aus' })).toBeVisible();
	await page.getByRole('button', { name: 'Liegeton aus' }).click();
	await expect(page.getByRole('button', { name: 'A4 spielen' })).toBeVisible();
});

test('turning keys, the metronome and the tuner panel', async ({ page }) => {
	await open(page, PART);
	await expect(page.locator('.slot canvas')).toHaveCount(1);
	// A pedal sends these; on a one-page part they stay on it.
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('PageDown');
	await expect(page.getByText('Seite 1 von 1')).toBeVisible();

	await tool(page, 'Metronom');
	const bpm = page.getByRole('spinbutton', { name: 'Schläge pro Minute' });
	await expect(bpm).toHaveValue('92');
	await expect(page.locator('.metronome .name')).toHaveText('Andante');
	await page.getByRole('button', { name: 'Schneller' }).click();
	await expect(bpm).toHaveValue('93');
	// A tempo marking jumps to its tempo; a time signature gives the bar its beats.
	await page.getByRole('combobox', { name: 'Tempo' }).selectOption('Allegro');
	await expect(bpm).toHaveValue('138');
	await page.getByRole('combobox', { name: 'Takt' }).selectOption('3/4');
	await expect(page.locator('.metronome .beat')).toHaveCount(3);
	await page.getByRole('combobox', { name: 'Takt' }).selectOption('6/8');
	await expect(page.locator('.metronome .beat')).toHaveCount(6);
	await page.getByRole('button', { name: /Punktierte Viertel/ }).click();
	await expect(page.locator('.metronome .beat')).toHaveCount(2);
	await expect(page.locator('.metronome .unit')).toHaveText('♩. =');
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.getByRole('button', { name: 'Stopp' })).toBeVisible();
	await page.getByRole('button', { name: 'Stopp' }).click();

	await tool(page, 'Stimmgerät');
	await expect(page.getByRole('button', { name: 'Mikrofon einschalten' })).toBeVisible();
	await page.getByRole('button', { name: 'Werkzeuge schließen' }).click();
	await page.getByRole('button', { name: 'Vollbild' }).click();
	await expect(page.locator('.score.full')).toBeVisible();
	// The page fills the screen below the controls (#235): down to its foot, or its whole width on a narrow screen.
	await expect
		.poll(() =>
			page.locator('.sheet').evaluate((sheet) => {
				const { top, bottom, width } = sheet.getBoundingClientRect();
				const controls = document.querySelector('.full .controls')!.getBoundingClientRect();
				return top >= controls.bottom - 1 && (Math.round(bottom) === innerHeight || Math.round(width) === innerWidth);
			})
		)
		.toBe(true);
	// The tools in full screen, from the same button; a metronome started there keeps going after.
	await tool(page, 'Metronom');
	const panel = page.locator('.full .dock');
	await expect(panel).toBeVisible();
	await panel.getByRole('button', { name: 'Start' }).click();
	await panel.getByRole('button', { name: 'Werkzeuge schließen' }).click();
	await expect(panel).toBeHidden();
	await page.keyboard.press('Escape');
	await expect(page.locator('.score.full')).toHaveCount(0);
	await tool(page, 'Metronom');
	await expect(page.getByRole('button', { name: 'Stopp' })).toBeVisible();
	await page.getByRole('button', { name: 'Stopp' }).click();
});

test('the member’s notes are in the concert’s merged PDF', async ({ page }) => {
	await open(page, PART);
	await expect(page.locator('.slot canvas')).toHaveCount(1);
	await page.getByRole('button', { name: 'Stift' }).click();
	const saved = page.waitForResponse((response) => response.url().endsWith('/api/ueben/notizen') && response.request().method() === 'PUT');
	await draw(page, [0.2, 0.2], [0.6, 0.3]);
	expect((await saved).status()).toBe(204);

	// The merged PDF as the page hands it to the browser for saving.
	await page.addInitScript(() => {
		const make = URL.createObjectURL.bind(URL);
		URL.createObjectURL = (blob: Blob) => (((window as unknown as { merged: Blob }).merged = blob), make(blob));
	});
	await open(page, '/meine-noten');
	const concert = page.locator('section.concert').first();
	const downloading = page.waitForEvent('download');
	await concert.getByRole('button', { name: 'Als eine PDF' }).click();
	await downloading;
	const bytes = await page.evaluate(async () => [...new Uint8Array(await (window as unknown as { merged: Blob }).merged.arrayBuffer())]);
	const merged = await PDFDocument.load(new Uint8Array(bytes));
	// The marked part comes first; a page with notes has one content stream more than one without.
	const streams = (index: number) => {
		const contents = merged.getPage(index).node.Contents();
		return contents instanceof PDFArray ? contents.size() : 1;
	};
	expect(merged.getPageCount()).toBeGreaterThan(1);
	expect(streams(0)).toBeGreaterThan(streams(1));
});

test('the concert mode turns on into the next piece, its head clear of the controls', async ({ page }) => {
	await open(page, '/meine-noten');
	await page.locator('section.concert').first().getByRole('button', { name: 'Auftrittsmodus' }).click();
	const piece = page.locator('.concert-mode select');
	const canvas = page.locator('.concert-mode .slot canvas');
	await expect(canvas).toHaveCount(1);
	const first = await canvas.evaluate((each: HTMLCanvasElement) => each.toDataURL());

	// The parts here are one page each: the next turn is the next piece, drawn anew.
	await page.keyboard.press('ArrowRight');
	await expect(piece).toHaveValue('1');
	await expect.poll(() => canvas.evaluate((each: HTMLCanvasElement) => each.toDataURL())).not.toBe(first);

	// The page starts below the controls, which never lie over it (#235).
	const controls = (await page.locator('.concert-mode .controls').boundingBox())!;
	const sheet = (await page.locator('.concert-mode .sheet').boundingBox())!;
	expect(sheet.y).toBeGreaterThanOrEqual(controls.y + controls.height - 1);
});

test('the metronome’s weight sets the tempo when dragged', async ({ page }) => {
	await open(page, PART);
	await tool(page, 'Metronom');
	const bpm = page.getByRole('spinbutton', { name: 'Schläge pro Minute' });
	await expect(bpm).toHaveValue('92');
	// Up the rod is slower, as on a real one.
	const weight = page.getByRole('slider', { name: 'Schläge pro Minute' });
	const box = (await weight.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 40, { steps: 6 });
	await page.mouse.up();
	expect(Number(await bpm.inputValue())).toBeLessThan(80);
	// And with the keyboard, as a slider.
	const before = Number(await bpm.inputValue());
	await weight.focus();
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('PageUp');
	await expect(bpm).toHaveValue(String(before + 11));
});

/** The page's box and the tools' box on screen. */
async function boxes(page: Page) {
	return page.evaluate(() => {
		const rect = (selector: string) => {
			const { left, top, right, bottom, width, height } = document.querySelector(selector)!.getBoundingClientRect();
			return { left, top, right, bottom, width, height };
		};
		return { sheet: rect('.sheet'), dock: rect('.dock'), place: document.querySelector('.dock')!.className };
	});
}

test('the tools never cover the music, and only in full screen without room does it shrink for them', async ({ page }) => {
	await open(page, PART);
	await expect(page.locator('.slot canvas')).toHaveCount(1);
	for (const mode of ['page', 'full'] as const) {
		if (mode === 'full') await page.getByRole('button', { name: 'Vollbild' }).click();
		await page.waitForTimeout(300);
		const before = await page.locator('.sheet').boundingBox();
		for (const name of ['Metronom', 'Stimmgerät', 'Liegeton'] as const) {
			await tool(page, name);
			await expect(page.locator('.dock')).toBeVisible();
			await page.waitForTimeout(300);
			const { sheet, dock, place } = await boxes(page);
			// The same size as without the tools, except above the page in full screen, where the screen is all there is.
			if (mode === 'page' || !place.includes('above')) {
				expect(Math.round(sheet.width), `${mode} ${name}`).toBe(Math.round(before!.width));
				expect(Math.round(sheet.height), `${mode} ${name}`).toBe(Math.round(before!.height));
			}
			// Beside, below or above the page, never over it (#235).
			const apart = dock.left >= sheet.right - 1 || dock.right <= sheet.left + 1 || dock.top >= sheet.bottom - 1 || dock.bottom <= sheet.top + 1;
			expect(apart, `${mode} ${name} ${place}`).toBe(true);
			await page.getByRole('button', { name: 'Werkzeuge schließen' }).click();
			await expect(page.locator('.dock')).toBeHidden();
		}
	}
});

/** Drags by the grip, by finger on the phone (as touch sends it) and with the mouse on the desktop. */
async function dragGrip(page: Page, by: { x: number; y: number }) {
	const grip = page.getByRole('button', { name: /Werkzeuge verschieben/ });
	const box = (await grip.boundingBox())!;
	const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	const steps = Array.from({ length: 9 }, (_, i) => ({ x: from.x + (by.x * i) / 8, y: from.y + (by.y * i) / 8 }));
	if (test.info().project.name === 'phone') {
		await grip.evaluate((element, points) => {
			const send = (type: string, point: { x: number; y: number }) =>
				element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: point.x, clientY: point.y }));
			send('pointerdown', points[0]);
			for (const point of points.slice(1)) send('pointermove', point);
			send('pointerup', points.at(-1)!);
		}, steps);
		return;
	}
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	for (const step of steps.slice(1)) await page.mouse.move(step.x, step.y);
	await page.mouse.up();
}

test('the tools can be moved, keep running, stay put after a reload and go back on request (#248)', async ({ page }) => {
	await open(page, PART);
	await expect(page.locator('.slot canvas')).toHaveCount(1);
	await tool(page, 'Metronom');
	await page.getByRole('button', { name: 'Start' }).click();
	const dock = page.locator('.dock');
	const before = (await dock.boundingBox())!;
	// Where the panel is in the music's area, as it's kept: the page above it may scroll or grow.
	const inArea = async () => {
		const [box, area] = [(await dock.boundingBox())!, (await page.locator('.area').boundingBox())!];
		return { x: Math.round(box.x - area.x), y: Math.round(box.y - area.y) };
	};

	await dragGrip(page, { x: -120, y: 60 });
	await expect(dock).toHaveClass(/free/);
	const box = (await dock.boundingBox())!;
	expect(Math.abs(box.x - before.x) + Math.abs(box.y - before.y)).toBeGreaterThan(40);
	const moved = await inArea();
	// Moving it neither stops the metronome nor turns the page.
	await expect(page.getByRole('button', { name: 'Stopp' })).toBeVisible();
	await expect(page.getByText('Seite 1 von 1')).toBeVisible();

	// Folded to a pill, still running, and open again with a tap.
	await page.getByRole('button', { name: 'Einklappen' }).click();
	await expect(dock.getByRole('button', { name: 'Werkzeuge', exact: true })).toBeVisible();
	await dock.getByRole('button', { name: 'Werkzeuge', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Stopp' })).toBeVisible();
	await page.getByRole('button', { name: 'Stopp' }).click();
	await expectAccessible(page);

	await open(page, PART);
	await tool(page, 'Metronom');
	await expect(dock).toHaveClass(/free/);
	await expect(page.locator('.slot canvas')).toHaveCount(1);
	await expect.poll(inArea).toEqual(moved);

	// Dragged far past the edge, it stays on screen.
	await dragGrip(page, { x: -2000, y: -2000 });
	const clamped = (await dock.boundingBox())!;
	const area = (await page.locator('.area').boundingBox())!;
	expect(clamped.x).toBeGreaterThanOrEqual(area.x - 1);
	expect(clamped.y).toBeGreaterThanOrEqual(area.y - 1);

	await page.getByRole('button', { name: 'Automatisch platzieren' }).click();
	await expect(dock).not.toHaveClass(/free/);
	await open(page, PART);
	await tool(page, 'Metronom');
	await expect(dock).not.toHaveClass(/free/);
});

test('two fingers on the glass draw one line, and symbols go on with a tap (#235, #236)', async ({ page }) => {
	await open(page, PART);
	await expect(page.locator('.slot canvas')).toHaveCount(1);
	await page.getByRole('button', { name: 'Stift' }).click();
	const saved = page.waitForResponse((response) => response.url().endsWith('/api/ueben/notizen') && response.request().method() === 'PUT');
	await page.locator('svg.marks').evaluate((svg) => {
		const box = svg.getBoundingClientRect();
		const send = (type: string, id: number, x: number, y: number) =>
			svg.dispatchEvent(
				new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, buttons: type === 'pointerup' ? 0 : 1, clientX: box.left + box.width * x, clientY: box.top + box.height * y })
			);
		send('pointerdown', 1, 0.2, 0.4);
		send('pointerdown', 2, 0.8, 0.8);
		for (let i = 1; i <= 8; i++) {
			send('pointermove', 1, 0.2 + i * 0.03, 0.4);
			send('pointermove', 2, 0.8 - i * 0.05, 0.8 - i * 0.04);
		}
		send('pointerup', 2, 0.4, 0.48);
		send('pointerup', 1, 0.44, 0.4);
	});
	// One straight line: the second finger's moves never joined it.
	await expect(page.locator('svg.marks path')).toHaveCount(1);
	const ys = (await page.locator('svg.marks path').getAttribute('d'))!.match(/ [\d.]+/g)!.map(Number);
	expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
	expect((await saved).status()).toBe(204);

	// A down-bow: one tap, one point stored, drawn as its two lines.
	await page.getByRole('button', { name: 'Abstrich' }).click();
	const stamped = page.waitForRequest((request) => request.url().endsWith('/api/ueben/notizen') && request.method() === 'PUT');
	await page.locator('svg.marks').click({ position: { x: 60, y: 40 } });
	const sent = (await stamped).postDataJSON() as { strokes: { points: number[]; symbol?: string }[] };
	expect(sent.strokes.at(-1)).toMatchObject({ symbol: 'downbow' });
	expect(sent.strokes.at(-1)!.points).toHaveLength(2);
	await expect(page.locator('svg.marks path')).toHaveCount(3);
});

test('notes from the section: one taken over by hand, then the rest at once', async ({ page }) => {
	await open(page, PART);
	await expect(page.locator('.slot canvas')).toHaveCount(1);
	// The demo member's desk partner offers her four marks in this part.
	const offer = page.locator('.offer');
	await expect(offer).toContainText('Greta Pult bietet dir 4 Notizen');
	await offer.getByRole('button', { name: 'Ansehen' }).click();
	await expect(page.locator('g.offered')).toHaveCount(4);
	// The one taken over is the member's own, and saved as such.
	const saved = page.waitForResponse((response) => response.url().endsWith('/api/ueben/notizen') && response.request().method() === 'PUT');
	await page.locator('g.offered').first().focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('g.offered')).toHaveCount(3);
	expect((await saved).status()).toBe(204);
	await offer.getByRole('button', { name: 'Alle übernehmen' }).click();
	await expect(offer).toHaveCount(0);

	// After reloading: all four marks hers (a down-bow is two lines, mf three), the offer answered.
	await open(page, PART);
	await expect(page.locator('svg.marks > path')).toHaveCount(7);
	await expect(page.locator('.offer')).toHaveCount(0);

	// Her own offer to the section, and taken back.
	page.on('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Stift' }).click();
	await page.getByRole('button', { name: 'Mit Stimmgruppe teilen' }).click();
	await expect(page.getByRole('button', { name: 'Nicht mehr teilen' })).toBeVisible();
	await page.getByRole('button', { name: 'Nicht mehr teilen' }).click();
	await expect(page.getByRole('button', { name: 'Mit Stimmgruppe teilen' })).toBeVisible();
});
