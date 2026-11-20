import { describe, expect, it } from 'vitest';
import { REQUEST_FIELD, RequestIds, stampForm } from '#lib/request-id.ts';
import { memoryStore } from './db/memory.ts';
import { once, peekRequestId, requestKey, storable } from './requests.ts';

const ID = '3f2a9c1e-0b7d-4e55-9a1f-6c2d8e4b7a10';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fast = { total: 40, step: 10 };

describe('the request id in a form (#191)', () => {
	it('goes first, keeping every other field and file in order', () => {
		const data = new FormData();
		data.append('title', 'Moldau');
		data.append('part', new File(['pdf'], 'Flöte 1.pdf'));
		data.append('title', 'zweiter');
		stampForm(data, ID);
		expect([...data.keys()]).toEqual([REQUEST_FIELD, 'title', 'part', 'title']);
		expect((data.get('part') as File).name).toBe('Flöte 1.pdf');
		stampForm(data, 'another-id-123');
		expect(data.getAll(REQUEST_FIELD)).toEqual(['another-id-123']);
	});

	it('stays for a retry of the same content, and is new after an answer or a change', () => {
		const ids = new RequestIds();
		const form = {};
		const data = new FormData();
		data.set('answer', 'yes');
		const first = ids.for(form, data);
		expect(first).toMatch(/^[\w-]{8,64}$/);
		stampForm(data, first!);
		expect(ids.for(form, data)).toBe(first);
		data.set('answer', 'no');
		const changed = ids.for(form, data);
		expect(changed).not.toBe(first);
		ids.answered(form);
		expect(ids.for(form, data)).not.toBe(changed);
	});
});

describe('reading the id on the server', () => {
	it('finds it first in a urlencoded or multipart body, and leaves the body readable', async () => {
		const plain = new Request('https://x.test/kalender/1?/answer', { method: 'POST', body: new URLSearchParams([[REQUEST_FIELD, ID], ['answer', 'yes']]) });
		expect(await peekRequestId(plain)).toBe(ID);
		expect((await plain.formData()).get('answer')).toBe('yes');

		const data = new FormData();
		stampForm(data, ID);
		data.append('file', new File(['x'.repeat(50_000)], 'big.pdf'));
		const upload = new Request('https://x.test/stuecke/1?/upload', { method: 'POST', body: data });
		expect(await peekRequestId(upload)).toBe(ID);
		expect(((await upload.formData()).get('file') as File).size).toBe(50_000);
	});

	it('ignores an id that is not the first field, or not an id', async () => {
		const later = new Request('https://x.test/', { method: 'POST', body: new URLSearchParams([['answer', 'yes'], [REQUEST_FIELD, ID]]) });
		expect(await peekRequestId(later)).toBeNull();
		const odd = new Request('https://x.test/', { method: 'POST', body: new URLSearchParams([[REQUEST_FIELD, '<script>']]) });
		expect(await peekRequestId(odd)).toBeNull();
		expect(await peekRequestId(new Request('https://x.test/', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }))).toBeNull();
	});

	it('keys per account, so one account cannot replay another one’s save', async () => {
		expect(await requestKey('A@x.org', ID)).toBe(await requestKey('a@x.org', ID));
		expect(await requestKey('a@x.org', ID)).not.toBe(await requestKey('b@x.org', ID));
	});
});

describe('a save that happens once', () => {
	it('gives a repeat the first answer without saving again', async () => {
		const store = memoryStore();
		let saves = 0;
		const save = async () => (saves++, json({ type: 'success', status: 200, data: '[{"saved":1},true]' }));
		const first = await once('k', save, store, fast);
		const again = await once('k', save, store, fast);
		expect(saves).toBe(1);
		expect(await again.text()).toBe(await first.text());
		expect(again.headers.get('x-request-replayed')).toBe('1');
	});

	it('lets a double tap wait for the first, then answers it the same', async () => {
		const store = memoryStore();
		let saves = 0;
		let release!: () => void;
		const slow = () => new Promise<Response>((done) => (release = () => done(json({ type: 'failure', status: 400, data: '[{"error":1},"Titel fehlt"]' }, 400))));
		const first = once('k', async () => (saves++, slow()), store, { total: 1000, step: 5 });
		await new Promise((done) => setTimeout(done, 5));
		const second = once('k', async () => (saves++, json({ type: 'success', status: 200 })), store, { total: 1000, step: 5 });
		await new Promise((done) => setTimeout(done, 20));
		release();
		const [a, b] = await Promise.all([first, second]);
		expect(saves).toBe(1);
		expect(b.status).toBe(400);
		expect(await b.text()).toBe(await a.text());
	});

	it('says "still saving" when the first takes too long', async () => {
		const store = memoryStore();
		await store.claimRequest('k');
		const response = await once('k', async () => json({ type: 'success', status: 200 }), store, fast);
		expect(response.status).toBe(409);
	});

	it('runs a retry again after a server error or a thrown one', async () => {
		const store = memoryStore();
		let saves = 0;
		await once('k', async () => (saves++, json({ type: 'error', error: { message: 'x' } }, 500)), store, fast);
		await expect(once('k', async () => (saves++, Promise.reject(new Error('Google down'))), store, fast)).rejects.toThrow('Google down');
		await once('k', async () => (saves++, json({ type: 'success', status: 200 })), store, fast);
		expect(saves).toBe(3);
	});

	it('saves anyway when the log cannot be reached', async () => {
		const store = { ...memoryStore(), claimRequest: () => Promise.reject(new Error('D1 down')) };
		const response = await once('k', async () => json({ type: 'success', status: 200 }), store, fast);
		expect(response.status).toBe(200);
	});

	it('keeps action results only, and only their kind when large', () => {
		expect(storable(200, 'text/html', '<html>')).toBeNull();
		expect(storable(500, 'application/json', '{"type":"error"}')).toBeNull();
		expect(storable(200, 'application/json', '{"type":"redirect","status":303,"location":"/x"}')).toEqual({ status: 200, body: '{"type":"redirect","status":303,"location":"/x"}' });
		const big = storable(200, 'application/json', JSON.stringify({ type: 'success', status: 200, data: 'x'.repeat(300_000) }));
		expect(JSON.parse(big!.body)).toEqual({ type: 'success', status: 200 });
	});
});
