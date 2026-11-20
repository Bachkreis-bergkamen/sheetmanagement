import * as t from '#lib/i18n/texts.ts';
import { isRequestId, REQUEST_FIELD } from '#lib/request-id.ts';
import { getStore, type Store, type StoredResult } from './db/index.ts';

/**
 * Saves that happen once (#191). A form action sent from the app carries a request id
 * (request-id.ts); the first request with it runs, and its answer is kept for a day. A repeat
 * (double tap, a retry after the answer got lost) gets that answer and saves nothing. A repeat
 * that arrives while the first is still saving waits for it a few seconds.
 *
 * A save that fails with a server error is forgotten, so trying again runs it again. Without the
 * database the save runs as before: a missing guard must never stop a save.
 */

/** How long a repeat is answered from the log. */
export const KEEP_REQUESTS_HOURS = 24;
/** How long a repeat waits for the first request to finish, and how often it looks. */
const WAIT_MS = 8000;
const POLL_MS = 250;
/** Answers larger than this keep only their kind and status, not the data they carried. */
const MAX_BODY = 200_000;
/** Enough of the body to hold the first field, also as a multipart part with its header. */
const PEEK_BYTES = 1024;

const URLENCODED = new RegExp(`^${REQUEST_FIELD}=([\\w-]{8,64})(?:&|$)`);
const MULTIPART = new RegExp(`^--[^\\r\\n]+\\r\\nContent-Disposition: form-data; name="${REQUEST_FIELD}"\\r\\n\\r\\n([\\w-]{8,64})\\r\\n`, 'i');

/**
 * The request id from the body's first field, read from a copy of the body and only its first
 * kilobyte, so a large upload isn't read twice. Null for anything else.
 */
export async function peekRequestId(request: Request): Promise<string | null> {
	const type = request.headers.get('content-type') ?? '';
	const pattern = type.startsWith('application/x-www-form-urlencoded') ? URLENCODED : type.startsWith('multipart/form-data') ? MULTIPART : null;
	if (!pattern || !request.body) return null;
	const reader = request.clone().body!.getReader();
	const decoder = new TextDecoder();
	let text = '';
	try {
		while (text.length < PEEK_BYTES) {
			const { done, value } = await reader.read();
			if (done) break;
			text += decoder.decode(value, { stream: true });
		}
	} catch {
		return null;
	} finally {
		reader.cancel().catch(() => {});
	}
	const id = pattern.exec(text)?.[1];
	return isRequestId(id) ? id : null;
}

/** The log's key: the account and the id, hashed, so one account can't replay another's save. */
export async function requestKey(account: string, id: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${account.toLowerCase()}\n${id}`));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * What of an action's answer is kept: success, failure and redirect as SvelteKit sent them.
 * Errors and anything that isn't an action result give null, and the request is forgotten.
 */
export function storable(status: number, contentType: string | null, body: string): StoredResult | null {
	if (status >= 500 || !(contentType ?? '').includes('application/json')) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return null;
	}
	const result = parsed as { type?: unknown; status?: unknown; location?: unknown };
	if (result?.type !== 'success' && result?.type !== 'failure' && result?.type !== 'redirect') return null;
	if (body.length <= MAX_BODY) return { status, body };
	// The save happened; a repeat needs to know that, not the long list it returned.
	return { status, body: JSON.stringify({ type: result.type, status: result.status, ...(result.type === 'redirect' ? { location: result.location } : {}) }) };
}

const replay = (result: StoredResult) =>
	new Response(result.body, { status: result.status, headers: { 'content-type': 'application/json', 'x-request-replayed': '1' } });

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Runs the save once per key; see the top of this file. */
export async function once(key: string, save: () => Promise<Response>, store: Store = getStore(), wait = { total: WAIT_MS, step: POLL_MS }): Promise<Response> {
	let claim: Awaited<ReturnType<Store['claimRequest']>>;
	try {
		claim = await store.claimRequest(key);
		for (let waited = 0; claim === 'running' && waited < wait.total; waited += wait.step) {
			await sleep(wait.step);
			claim = await store.claimRequest(key);
		}
	} catch (error) {
		console.error(error);
		return save();
	}
	if (claim === 'running') {
		// Still saving after all that: the client says "try again", and the retry gets the answer.
		return new Response(t.common.stillSaving, { status: 409, headers: { 'content-type': 'text/plain; charset=utf-8' } });
	}
	if (claim !== 'claimed') return replay(claim);

	let response: Response;
	try {
		response = await save();
	} catch (error) {
		await store.finishRequest(key, null).catch(() => {});
		throw error;
	}
	const contentType = response.headers.get('content-type');
	// Only action results are kept, and those are small JSON; anything else passes through untouched.
	if (!(contentType ?? '').includes('application/json') || response.status >= 500) {
		await store.finishRequest(key, null).catch(() => {});
		return response;
	}
	const body = await response.text();
	await store.finishRequest(key, storable(response.status, contentType, body)).catch((error) => console.error(error));
	return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
