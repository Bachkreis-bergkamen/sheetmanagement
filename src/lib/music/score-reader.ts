/**
 * Reads the text lines of a score's first pages in the browser with pdf.js, loaded only
 * when someone clicks "Aus den Noten lesen". The PDF comes through the app's proxy
 * (/api/noten), which only streams it: the Worker does no PDF work on the free plan's
 * small CPU budget. Scans without a text layer give no lines.
 */

// The legacy build: pdf.js 6's modern one uses JavaScript Safari doesn't have yet
// (Math.sumPrecise, Map.getOrInsert, Promise.try), so iPhones, iPads and Macs showed no pages.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

export class ScoreReadError extends Error {
	constructor(readonly reason: 'download' | 'unreadable') {
		super(reason);
		this.name = 'ScoreReadError';
	}
}

/**
 * Text items at about the same height are one line, read left to right. "About" is a third
 * of the text's size, so words of one line that sit a point apart stay together.
 */
export function groupLines(items: { str: string; transform: number[] }[]): string[] {
	const words = items
		.filter((item) => item.str?.trim())
		.map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5], size: Math.abs(item.transform[3]) || 10 }))
		.sort((a, b) => b.y - a.y);
	const lines: { y: number; size: number; words: typeof words }[] = [];
	for (const word of words) {
		const line = lines.at(-1);
		if (line && Math.abs(line.y - word.y) <= Math.max(line.size, word.size) / 3) line.words.push(word);
		else lines.push({ y: word.y, size: word.size, words: [word] });
	}
	return lines.map((line) =>
		line.words
			.sort((a, b) => a.x - b.x)
			.map((word) => word.str)
			.join(' ')
	);
}

/** A part's PDF opened with pdf.js; destroy() frees it again. */
export async function openScore(fileId: string) {
	let data: ArrayBuffer;
	try {
		const response = await fetch(`/api/noten/${encodeURIComponent(fileId)}`);
		if (!response.ok) throw new Error(String(response.status));
		data = await response.arrayBuffer();
	} catch {
		throw new ScoreReadError('download');
	}
	try {
		const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
		pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
		// Copy-protected publisher PDFs open with the empty password, like for merging (#80).
		// Scans are often JBIG2 images, which need pdf.js's WebAssembly decoders (vite.config.ts).
		const task = pdfjs.getDocument({ data, password: '', wasmUrl: '/pdfjs-wasm/' });
		const doc = await task.promise;
		return { doc, destroy: () => task.destroy() };
	} catch {
		throw new ScoreReadError('unreadable');
	}
}

export type OpenScore = Awaited<ReturnType<typeof openScore>>;

export async function readScoreLines(fileId: string, pages = 2): Promise<string[]> {
	return (await readScorePages(fileId, pages)).lines;
}

/** How far into the page the names at the left of the first system reach. */
const LABEL_STRIP = 0.22;

/**
 * The text lines of the first pages, and the first page's left strip on its own: there a
 * score names the instruments of its first system ("Flauto I, II", "Violino I"), for the
 * Besetzung (#249).
 */
export async function readScorePages(fileId: string, pages = 2): Promise<{ lines: string[]; labels: string[] }> {
	const { doc, destroy } = await openScore(fileId);
	try {
		const lines: string[] = [];
		let labels: string[] = [];
		for (let number = 1; number <= Math.min(pages, doc.numPages); number++) {
			const page = await doc.getPage(number);
			const items = (await page.getTextContent()).items as { str: string; transform: number[] }[];
			lines.push(...groupLines(items));
			if (number === 1) {
				const [left, , right] = page.view;
				labels = groupLines(items.filter((item) => item.transform?.[4] - left < (right - left) * LABEL_STRIP));
			}
		}
		return { lines, labels };
	} catch {
		throw new ScoreReadError('unreadable');
	} finally {
		await destroy();
	}
}

const MAX_PIXELS = 8_000_000;

/** A page's size at scale 1 (PDF points), for fitting it to the screen. */
export async function pageSize({ doc }: OpenScore, number: number): Promise<{ width: number; height: number }> {
	const { width, height } = (await doc.getPage(number)).getViewport({ scale: 1 });
	return { width, height };
}

/**
 * Draws one page into a canvas, scaled to the given CSS width and sharp on high-density
 * screens. For looking at scans the reader can't read (#manual entry).
 */
export async function renderPage({ doc }: OpenScore, number: number, canvas: HTMLCanvasElement, width: number): Promise<void> {
	const page = await doc.getPage(number);
	const base = page.getViewport({ scale: 1 });
	// Sharp on high-density screens, but not past what phones draw: iOS leaves a canvas over
	// about 16 million pixels (or too many large ones together) blank.
	const height = (width * base.height) / base.width;
	const ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (width * height)));
	const viewport = page.getViewport({ scale: (width / base.width) * ratio });
	canvas.width = Math.floor(viewport.width);
	canvas.height = Math.floor(viewport.height);
	canvas.style.width = `${width}px`;
	await page.render({ canvas, viewport }).promise;
}

/** The left strip of page 1 is drawn this wide for text recognition: about 240 dpi on A4. */
const OCR_WIDTH = 2000;

/**
 * Text recognition for scans without a text layer (#249), in the browser with Tesseract: only
 * the left strip of the first page, where the instruments are named. Loaded on first use; its
 * engine and the language data come from Tesseract's own servers (jsDelivr, tessdata), the
 * score itself never leaves the browser. One reader for many scores; close() when done.
 */
export async function createLabelReader() {
	const { createWorker } = await import('tesseract.js');
	const worker = await createWorker('deu');
	return {
		async labels(fileId: string): Promise<string[]> {
			const score = await openScore(fileId);
			try {
				const page = document.createElement('canvas');
				await renderPage(score, 1, page, OCR_WIDTH / (window.devicePixelRatio || 1));
				const strip = document.createElement('canvas');
				strip.width = Math.round(page.width * LABEL_STRIP);
				strip.height = page.height;
				strip.getContext('2d')!.drawImage(page, 0, 0);
				const { data } = await worker.recognize(strip);
				const { tidyRecognised } = await import('./instrumentation.ts');
				return data.text
					.split('\n')
					.map((line) => tidyRecognised(line.trim()))
					.filter(Boolean);
			} finally {
				await score.destroy();
			}
		},
		close: () => worker.terminate()
	};
}
