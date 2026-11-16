import type { OpenScore } from '#lib/music/score-reader.ts';
import { markLines, type MarkColor, type Stroke } from './marks.ts';

/**
 * Printing a part from the practice viewer (#362): every page is drawn as an image, with the
 * member's own marks on it, and handed to the system's print dialogue. As images, not the PDF
 * itself: phones show no PDF inside a page, so there's nothing of it a page could print, and
 * `window.print()` is the one call every browser has.
 */

/** A page is drawn this wide: about 200 dpi on A4, and far below what phones can draw. */
export const PRINT_WIDTH = 1654;

/** The viewer's colours (PracticeScore.svelte). */
const COLORS: Record<MarkColor, string> = { graphite: '#4a4a4a', red: '#d0342c', blue: '#1f5fd1' };

/** The few canvas calls drawing marks needs, so it can be tested without a browser. */
export type Pen = Pick<CanvasRenderingContext2D, 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'lineWidth' | 'lineCap' | 'lineJoin' | 'strokeStyle'>;

/** Draws a page's marks onto its image, as thick as in the viewer (0.32 % of the page's width). */
export function drawMarksOn(pen: Pen, strokes: Stroke[] | undefined, width: number, height: number) {
	if (!strokes?.length) return;
	pen.lineWidth = Math.max(1.5, width * 0.0032);
	pen.lineCap = 'round';
	pen.lineJoin = 'round';
	for (const stroke of strokes) {
		pen.strokeStyle = COLORS[stroke.color] ?? COLORS.graphite;
		for (const line of markLines(stroke, width / height)) {
			pen.beginPath();
			pen.moveTo(line[0] * width, line[1] * height);
			// A dot: a line of no length, which the round cap draws.
			if (line.length === 2) pen.lineTo(line[0] * width + 0.01, line[1] * height);
			for (let i = 2; i < line.length; i += 2) pen.lineTo(line[i] * width, line[i + 1] * height);
			pen.stroke();
		}
	}
}

/** The paper's size for the print: each sheet is the first page's size, without margins of its own. */
export const pageRule = (width: number, height: number) => `@page { size: ${width.toFixed(1)}pt ${height.toFixed(1)}pt; margin: 0 }`;

const SHEETS = 'print-sheets';
const PRINTING = 'printing-score';

/** Takes the last print's pages off the page again. */
function tidy() {
	document.documentElement.classList.remove(PRINTING);
	for (const old of document.querySelectorAll(`.${SHEETS}, style[data-${SHEETS}]`)) {
		for (const image of old.querySelectorAll('img')) URL.revokeObjectURL(image.src);
		old.remove();
	}
}

/**
 * Opens the print dialogue with every page of the part. `progress` hears each page as it's
 * drawn. Throws when a page can't be drawn; nothing is left on the page then.
 */
export async function printScore(score: OpenScore, marks: Record<number, Stroke[]>, progress?: (page: number, pages: number) => void): Promise<void> {
	tidy();
	const sheets = document.createElement('div');
	sheets.className = SHEETS;
	const pages = score.doc.numPages;
	let rule = '';
	try {
		for (let number = 1; number <= pages; number++) {
			progress?.(number, pages);
			const page = await score.doc.getPage(number);
			const base = page.getViewport({ scale: 1 });
			if (number === 1) rule = pageRule(base.width, base.height);
			const viewport = page.getViewport({ scale: PRINT_WIDTH / base.width });
			const canvas = document.createElement('canvas');
			canvas.width = Math.floor(viewport.width);
			canvas.height = Math.floor(viewport.height);
			await page.render({ canvas, viewport }).promise;
			const pen = canvas.getContext('2d');
			if (pen) drawMarksOn(pen, marks[number], canvas.width, canvas.height);
			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
			// The canvas's memory goes back before the next page is drawn (phones keep few large ones).
			canvas.width = canvas.height = 0;
			if (!blob) throw new Error('A page could not be drawn for printing.');
			const sheet = document.createElement('div');
			const image = document.createElement('img');
			image.alt = '';
			image.src = URL.createObjectURL(blob);
			sheet.append(image);
			sheets.append(sheet);
			await image.decode().catch(() => undefined);
		}
	} catch (error) {
		for (const image of sheets.querySelectorAll('img')) URL.revokeObjectURL(image.src);
		throw error;
	}
	const style = document.createElement('style');
	style.setAttribute(`data-${SHEETS}`, '');
	style.textContent = rule;
	document.head.append(style);
	document.body.append(sheets);
	document.documentElement.classList.add(PRINTING);
	// Some browsers come back from print() at once, others when the dialogue closes: the pages
	// stay until the browser says it's done, or until the next print.
	addEventListener('afterprint', tidy, { once: true });
	window.print();
}
