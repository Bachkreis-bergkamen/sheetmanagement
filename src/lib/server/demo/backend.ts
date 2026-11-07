import { GoogleClient } from '../google/client.ts';
import { DEMO_IDS, demoEvents, demoFiles, demoSheet, type DemoEvent, type DemoFile } from './data.ts';
import { samplePdf } from './pdf.ts';

/**
 * The demo's stand-in for Google (#121): answers the few Drive, Calendar and Sheets REST
 * calls the app makes from sample data in memory, so every page and editor runs its real
 * code without a Google account. Writes change the memory copy only; a restart (or another
 * Worker instance) starts from the sample data again.
 */

interface SheetTab {
	sheetId: number;
	values: string[][];
	protections: string[];
}

interface State {
	files: Map<string, DemoFile>;
	events: DemoEvent[];
	tabs: Map<string, SheetTab>;
	nextSheetId: number;
	nextFileId: number;
	/** Opened uploads (#193): the page sends the file to /demo/hochladen/<id> instead of to Google. */
	uploads: Map<string, { name: string; parents: string[]; replaceId?: string }>;
}

let state: State | null = null;

function load(): State {
	if (state) return state;
	const now = Date.now();
	const tabs = new Map<string, SheetTab>();
	let sheetId = 1;
	for (const [title, values] of demoSheet(now)) tabs.set(title, { sheetId: sheetId++, values, protections: [] });
	state = {
		files: new Map(demoFiles().map((file) => [file.id, file])),
		events: demoEvents(now),
		tabs,
		nextSheetId: sheetId,
		nextFileId: 1,
		uploads: new Map()
	};
	return state;
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const notFound = (message = 'Not found') => json({ error: { message } }, 404);

/** A1 notation as the app writes it: "'Stücke'", "'Stücke'!1:1", "'Stücke'!C5", "'Stücke'!A2:E10". */
export function parseRange(range: string): { tab: string; row: number; column: number; rows?: number } | null {
	const match = range.match(/^'((?:[^']|'')*)'(?:!(.+))?$/);
	if (!match) return null;
	const tab = match[1].replace(/''/g, "'");
	const cells = match[2];
	if (!cells) return { tab, row: 0, column: 0 };
	const rows = cells.match(/^(\d+):(\d+)$/);
	if (rows) return { tab, row: +rows[1] - 1, column: 0, rows: +rows[2] - +rows[1] + 1 };
	const cell = cells.match(/^([A-Z]+)(\d+)/);
	if (!cell) return null;
	const column = [...cell[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
	return { tab, row: +cell[2] - 1, column };
}

function sheets(url: URL, method: string, body: Record<string, unknown> | undefined): Response {
	const { tabs } = load();
	const path = decodeURIComponent(url.pathname.replace(/^\/v4\/spreadsheets\//, ''));
	const cut = path.search(/[:/]/);
	const [id, rest] = cut === -1 ? [path, ''] : [path.slice(0, cut), path.slice(cut)];
	if (id !== DEMO_IDS.sheet) return notFound('Spreadsheet not found');

	if (method === 'GET' && !rest) {
		return json({
			properties: { title: 'Repertoire (Demo)' },
			sheets: [...tabs].map(([title, tab]) => ({
				properties: { sheetId: tab.sheetId, title },
				protectedRanges: tab.protections.map((description) => ({ description }))
			}))
		});
	}
	if (method === 'GET' && rest === '/values:batchGet') {
		const valueRanges = url.searchParams.getAll('ranges').map((range) => {
			const parsed = parseRange(range);
			const values = parsed ? (tabs.get(parsed.tab)?.values ?? []) : [];
			return { range, values: parsed?.rows ? values.slice(parsed.row, parsed.row + parsed.rows) : values };
		});
		return json({ valueRanges });
	}
	const append = rest.match(/^\/values\/(.+):append$/);
	if (method === 'POST' && append) {
		const tab = tabs.get(parseRange(append[1])?.tab ?? '');
		if (!tab) return notFound('Tab not found');
		tab.values.push(...((body?.values as unknown[][]) ?? []).map((row) => row.map(String)));
		return json({});
	}
	if (method === 'POST' && rest === '/values:batchUpdate') {
		for (const { range, values } of (body?.data ?? []) as { range: string; values: unknown[][] }[]) {
			const parsed = parseRange(range);
			const tab = parsed && tabs.get(parsed.tab);
			if (!parsed || !tab) return notFound('Tab not found');
			values.forEach((cells, r) => {
				const row = (tab.values[parsed.row + r] ??= []);
				cells.forEach((value, c) => {
					while (row.length < parsed.column + c) row.push('');
					row[parsed.column + c] = typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value);
				});
			});
			for (let i = 0; i < tab.values.length; i++) tab.values[i] ??= [];
		}
		return json({});
	}
	if (method === 'POST' && rest === '/values:batchClear') {
		// The app clears everything below a row ("'Stücke'!A2:ZZ"), so that's all this does.
		for (const range of (body?.ranges ?? []) as string[]) {
			const parsed = parseRange(range);
			const tab = parsed && tabs.get(parsed.tab);
			if (!parsed || !tab) return notFound('Tab not found');
			tab.values.length = Math.min(tab.values.length, parsed.row);
		}
		return json({});
	}
	if (method === 'POST' && rest === ':batchUpdate') {
		const replies = ((body?.requests as Record<string, any>[]) ?? []).map((request) => {
			if (request.addSheet) {
				const title = request.addSheet.properties.title as string;
				const sheetId = load().nextSheetId++;
				tabs.set(title, { sheetId, values: [], protections: [] });
				return { addSheet: { properties: { sheetId, title } } };
			}
			const byId = (sheetId: number) => [...tabs].find(([, tab]) => tab.sheetId === sheetId);
			if (request.deleteDimension) {
				const { sheetId, startIndex, endIndex } = request.deleteDimension.range;
				byId(sheetId)?.[1].values.splice(startIndex, endIndex - startIndex);
			} else if (request.deleteSheet) {
				const found = byId(request.deleteSheet.sheetId);
				if (found) tabs.delete(found[0]);
			} else if (request.addProtectedRange) {
				byId(request.addProtectedRange.protectedRange.range.sheetId)?.[1].protections.push(
					request.addProtectedRange.protectedRange.description
				);
			}
			// Formatting, column widths and dropdowns don't matter in memory.
			return {};
		});
		return json({ replies });
	}
	return notFound();
}

function drive(url: URL, method: string, body: Record<string, unknown> | undefined): Response {
	const current = load();
	const path = decodeURIComponent(url.pathname.replace(/^\/drive\/v3\/files\/?/, ''));
	const [fileId, sub] = path.split('/', 2);

	if (!fileId && method === 'GET') {
		const parents = new Set([...(url.searchParams.get('q') ?? '').matchAll(/'([^']+)' in parents/g)].map((m) => m[1]));
		const files = [...current.files.values()]
			.filter((file) => file.parents.some((parent) => parents.has(parent)))
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(({ pdf, ...file }) => ({ ...file, size: pdf ? '2048' : undefined }));
		return json({ files });
	}
	if (!fileId && method === 'POST') {
		const file: DemoFile = {
			id: `demo-new-${current.nextFileId++}`,
			name: String(body?.name ?? ''),
			mimeType: String(body?.mimeType ?? ''),
			parents: (body?.parents as string[]) ?? [],
			modifiedTime: new Date().toISOString()
		};
		const target = (body?.shortcutDetails as { targetId?: string } | undefined)?.targetId;
		if (target) file.shortcutDetails = { targetId: target, targetMimeType: current.files.get(target)?.mimeType ?? '' };
		current.files.set(file.id, file);
		return json({ id: file.id, name: file.name });
	}

	const file = current.files.get(fileId);
	if (!file) return notFound('File not found');
	if (sub === 'comments') return json({ id: `demo-comment-${current.nextFileId++}` });
	if (sub) return json({ id: `demo-reply-${current.nextFileId++}` });
	if (method === 'PATCH') {
		// The bin: gone from every listing, as in Drive.
		if (body?.trashed === true) current.files.delete(file.id);
		file.name = String(body?.name ?? file.name);
		return json({ id: file.id, name: file.name });
	}
	if (url.searchParams.get('alt') === 'media') {
		if (!file.pdf) return json({ error: { message: 'Only PDFs can be downloaded' } }, 403);
		return new Response(samplePdf(file.pdf), { headers: { 'content-type': 'application/pdf' } });
	}
	const { pdf, ...metadata } = file;
	return json(metadata);
}

/** A resumable upload as Drive opens it: the session address in "Location". */
function upload(url: URL, body: Record<string, unknown> | undefined, origin: string): Response {
	const current = load();
	const replaceId = decodeURIComponent(url.pathname.replace(/^\/upload\/drive\/v3\/files\/?/, '')) || undefined;
	if (replaceId && !current.files.has(replaceId)) return notFound('File not found');
	const id = crypto.randomUUID();
	current.uploads.set(id, { name: String(body?.name ?? ''), parents: (body?.parents as string[]) ?? [], replaceId });
	return new Response(null, { status: 200, headers: { location: `${origin}/demo/hochladen/${id}` } });
}

/** The upload's content arrived: the file is in the folder, a sample PDF standing in for it. */
export function finishDemoUpload(sessionId: string): { id: string; name: string } | undefined {
	const current = load();
	const session = current.uploads.get(sessionId);
	if (!session) return undefined;
	current.uploads.delete(sessionId);
	const old = session.replaceId ? current.files.get(session.replaceId) : undefined;
	const file: DemoFile = old ?? { id: `demo-new-${current.nextFileId++}`, name: '', mimeType: 'application/pdf', parents: session.parents, modifiedTime: '' };
	file.name = session.name || file.name;
	file.modifiedTime = new Date().toISOString();
	file.pdf = { title: file.name.replace(/\.pdf$/i, ''), part: '' };
	current.files.set(file.id, file);
	return { id: file.id, name: file.name };
}

function calendar(url: URL, method: string, body: Record<string, unknown> | undefined): Response {
	if (!decodeURIComponent(url.pathname).includes(DEMO_IDS.calendar)) return notFound('Calendar not found');
	if (method === 'PATCH') {
		// A date changed on its page: its orchestras, or its title, time, place and note.
		const id = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
		const event = load().events.find((candidate) => candidate.id === id);
		if (!event) return notFound('Event not found');
		const patch = body as Partial<DemoEvent>;
		if (patch.summary) event.summary = patch.summary;
		const local = (time: DemoEvent['start']) => (time.dateTime ? { dateTime: time.dateTime } : { date: time.date });
		if (patch.start) event.start = local(patch.start);
		if (patch.end) event.end = local(patch.end);
		if (patch.location !== undefined) event.location = patch.location || undefined;
		if (patch.description !== undefined) event.description = patch.description || undefined;
		const shared = { ...event.extendedProperties?.shared, ...patch.extendedProperties?.shared };
		event.extendedProperties = { shared: Object.fromEntries(Object.entries(shared).filter(([, value]) => value !== null)) as Record<string, string> };
		return json(event);
	}
	if (method === 'POST') {
		// Added on /kalender: kept like the sample events, local times without a zone.
		const event = { ...(body as Omit<DemoEvent, 'id'>), id: `demo-neu-${crypto.randomUUID().slice(0, 8)}` } as DemoEvent;
		const local = (time: DemoEvent['start']) => (time.dateTime ? { dateTime: time.dateTime } : { date: time.date });
		event.start = local(event.start);
		event.end = local(event.end);
		load().events.push(event);
		return json(event);
	}
	const from = url.searchParams.get('timeMin') ?? '';
	const to = url.searchParams.get('timeMax') ?? '9999';
	const start = (event: DemoEvent) => event.start.dateTime ?? event.start.date ?? '';
	const items = load()
		.events.filter((event) => start(event) >= from.slice(0, 10) && start(event) <= to)
		.sort((a, b) => start(a).localeCompare(start(b)));
	return json({ items });
}

/** Answers like Google would; anything else is a 404, as an unknown Google URL would be. */
export const demoFetch: typeof fetch = async (input, init) => {
	const url = new URL(input instanceof Request ? input.url : String(input));
	const method = (init?.method ?? 'GET').toUpperCase();
	const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
	if (url.hostname === 'sheets.googleapis.com') return sheets(url, method, body);
	if (url.pathname.startsWith('/drive/v3/files')) return drive(url, method, body);
	if (url.pathname.startsWith('/upload/drive/v3/files')) return upload(url, body, new Headers(init?.headers).get('origin') ?? '');
	if (url.pathname.startsWith('/calendar/v3/')) return calendar(url, method, body);
	return notFound();
};

let client: GoogleClient | null = null;

/** A Google client that never leaves the Worker: no key, no token, no network. */
export function demoClient(): GoogleClient {
	client ??= new GoogleClient({ getToken: async () => 'demo' }, demoFetch);
	return client;
}

/** Back to the sample data, e.g. from the demo banner. */
export function resetDemo() {
	state = null;
}
