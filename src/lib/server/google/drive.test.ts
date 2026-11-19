import { describe, expect, it } from 'vitest';
import { GoogleClient } from './client.ts';
import { createComment, liveFile, queryString, renameFile, replyToComment, uploadFile } from './drive.ts';

describe('queryString', () => {
	it('quotes a plain folder id as is', () => {
		expect(queryString('1G98XaafBHbqCSxDaCzdX7yCYsgnZd9IY')).toBe("'1G98XaafBHbqCSxDaCzdX7yCYsgnZd9IY'");
	});

	it('escapes quotes and backslashes, backslashes first', () => {
		expect(queryString("it's")).toBe("'it\\'s'");
		// A trailing backslash must not escape the closing quote.
		expect(queryString('a\\')).toBe("'a\\\\'");
		expect(queryString("\\'")).toBe("'\\\\\\''");
	});
});

describe('writing to Drive', () => {
	const recorder = () => {
		const calls: { method: string; url: URL; body: unknown }[] = [];
		const client = new GoogleClient({ getToken: async () => 'token' }, (async (input: URL, init: RequestInit) => {
			calls.push({ method: init.method ?? 'GET', url: new URL(input), body: init.body ? JSON.parse(String(init.body)) : undefined });
			return Response.json({ id: 'new-id', name: 'renamed' });
		}) as typeof fetch);
		return { client, calls };
	};

	it('comments on a file and resolves the comment', async () => {
		const { client, calls } = recorder();
		expect(await createComment(client, 'file 1', 'Seite 3 fehlt')).toBe('new-id');
		await replyToComment(client, 'file 1', 'c/1', 'resolve', 'Erledigt.');
		expect(calls.map((c) => [c.method, c.url.pathname, c.body])).toEqual([
			['POST', '/drive/v3/files/file%201/comments', { content: 'Seite 3 fehlt' }],
			['POST', '/drive/v3/files/file%201/comments/c%2F1/replies', { action: 'resolve', content: 'Erledigt.' }]
		]);
		// Drive's comment API insists on "fields".
		expect(calls.every((c) => c.url.searchParams.get('fields') === 'id')).toBe(true);
	});

	it('renames a file, also in shared drives', async () => {
		const { client, calls } = recorder();
		await renameFile(client, 'f1', 'Elegie - Viola - LEER.pdf');
		expect(calls[0]).toMatchObject({ method: 'PATCH', body: { name: 'Elegie - Viola - LEER.pdf' } });
		expect(calls[0].url.searchParams.get('supportsAllDrives')).toBe('true');
	});
});

describe('uploadFile', () => {
	it('sends the metadata and the content in one multipart request', async () => {
		const calls: { url: URL; init: RequestInit }[] = [];
		const client = new GoogleClient({ getToken: async () => 'token' }, (async (input: URL, init: RequestInit) => {
			calls.push({ url: new URL(input), init });
			return Response.json({ id: 'new-id', name: 'daten-2026-10-30.json', mimeType: 'application/json' });
		}) as typeof fetch);
		const file = await uploadFile(client, { name: 'daten-2026-10-30.json', mimeType: 'application/json', folderId: 'backups', content: '{"tabs":{}}' });
		expect(file.id).toBe('new-id');

		const [{ url, init }] = calls;
		expect(init.method).toBe('POST');
		expect(url.pathname).toBe('/upload/drive/v3/files');
		expect(url.searchParams.get('uploadType')).toBe('multipart');
		const type = (init.headers as Record<string, string>)['content-type'];
		const boundary = type.match(/^multipart\/related; boundary=(.+)$/)?.[1];
		expect(boundary).toBeTruthy();
		const parts = (await (init.body as Blob).text()).split(`--${boundary}`);
		expect(parts.at(-1)).toBe('--');
		expect(JSON.parse(parts[1].split('\r\n\r\n')[1])).toEqual({ name: 'daten-2026-10-30.json', mimeType: 'application/json', parents: ['backups'] });
		expect(parts[2]).toBe('\r\ncontent-type: application/json\r\n\r\n{"tabs":{}}\r\n');
	});
});

describe('liveFile', () => {
	const answering = (response: () => Response) => new GoogleClient({ getToken: async () => 'token' }, (async () => response()) as typeof fetch);

	it('gives the folder while it is there', async () => {
		const client = answering(() => Response.json({ id: 'f1', name: 'Let it Snow', mimeType: 'application/vnd.google-apps.folder', trashed: false }));
		expect((await liveFile(client, 'f1'))?.name).toBe('Let it Snow');
	});

	it('counts a folder in the bin or deleted for good as gone', async () => {
		expect(await liveFile(answering(() => Response.json({ id: 'f1', name: 'Let it Snow', mimeType: 'x', trashed: true })), 'f1')).toBeUndefined();
		expect(await liveFile(answering(() => Response.json({ error: { message: 'File not found' } }, { status: 404 })), 'f1')).toBeUndefined();
	});

	it('passes other failures on, so a folder is not made twice when Drive just has a hiccup', async () => {
		await expect(liveFile(answering(() => Response.json({ error: { message: 'Forbidden' } }, { status: 403 })), 'f1')).rejects.toThrow();
	});
});
