/**
 * "Bist du dabei?" answered without a connection (#191): the answer waits on the device and is
 * sent once the device is online again, on any page, so a tap in a hall's dead spot isn't lost.
 * The buttons show it as chosen meanwhile, with a line saying it's still to be sent. Kept in
 * localStorage per account, like practice time (practice-queue.ts): it's a word per date.
 * Answering is safe to send twice: the server keeps one row per person and date.
 */
import { ANSWERS, type Answer } from '#lib/signups/signups.ts';
import { readLocalJson, writeLocal } from '#lib/local-storage.ts';

/** Per account, so an answer kept on a shared device is never sent as the next one who signs in there. */
const keyOf = (account: string) => `answers-pending:${account.toLowerCase()}`;

/** The answer per date, by its "answer" action's path: "/kalender/<id>?/answer". */
export type AnswerQueue = Record<string, Answer>;

/** The answers waiting on this device for the account signed in; the buttons read it. */
export const pendingAnswers = $state<{ queue: AnswerQueue }>({ queue: {} });

/** An action as a form names it ("?/answer" on the date's page) as the path to send it to later. */
export function actionPath(action: string, base: string): string {
	const url = new URL(action, base);
	return url.pathname + url.search;
}

/** Only answers to a date's "answer" action are kept; anything else in storage is dropped. */
export function parseQueue(value: unknown): AnswerQueue {
	if (!value || typeof value !== 'object') return {};
	return Object.fromEntries(
		Object.entries(value).filter((entry): entry is [string, Answer] => /^\/kalender\/[^/?]+\?\/answer$/.test(entry[0]) && ANSWERS.includes(entry[1] as Answer))
	);
}

/**
 * What the server's answer to a sent action means for the answer waiting: saved, refused for good
 * (the date has passed, sign-ups are off), or to try again later (server busy, signed out, no JSON).
 */
export function outcome(httpStatus: number, body: unknown): 'sent' | 'refused' | 'retry' {
	const result = body && typeof body === 'object' ? (body as { type?: unknown; status?: unknown }) : null;
	if (result?.type === 'success') return 'sent';
	if (result?.type === 'failure') {
		const status = typeof result.status === 'number' ? result.status : httpStatus;
		// 403: signed out meanwhile; the answer waits for the next sign-in of this account.
		return status === 400 || status === 404 || status === 409 ? 'refused' : 'retry';
	}
	return 'retry';
}

const read = (account: string) => parseQueue(readLocalJson(keyOf(account)));

function write(account: string, queue: AnswerQueue) {
	writeLocal(keyOf(account), Object.keys(queue).length ? JSON.stringify(queue) : null);
	pendingAnswers.queue = queue;
}

/** Reads what waits for this account, e.g. when the app starts. */
export function loadPendingAnswers(account: string) {
	pendingAnswers.queue = account ? read(account) : {};
}

/** Keeps an answer until it can be sent; a newer answer to the same date replaces the older. */
export function queueAnswer(account: string, path: string, answer: Answer) {
	write(account, parseQueue({ ...read(account), [path]: answer }));
}

/** The member answered online after all: nothing older may overwrite it later. */
export function dropQueuedAnswer(account: string, path: string) {
	const queue = read(account);
	if (!(path in queue)) return;
	delete queue[path];
	write(account, queue);
}

let sending: Promise<number> | null = null;

/** Sends what's waiting, one request per date; what can't go yet stays. Resolves with how many were saved. */
export function sendQueuedAnswers(account: string): Promise<number> {
	if (!account || (typeof navigator !== 'undefined' && !navigator.onLine)) return Promise.resolve(0);
	sending ??= (async () => {
		let saved = 0;
		for (const [path, answer] of Object.entries(read(account))) {
			let result: 'sent' | 'refused' | 'retry';
			try {
				const body = new FormData();
				body.set('answer', answer);
				const response = await fetch(path, { method: 'POST', body, headers: { accept: 'application/json', 'x-sveltekit-action': 'true' } });
				result = outcome(response.status, await response.json().catch(() => null));
			} catch {
				result = 'retry';
			}
			if (result === 'retry') break;
			if (result === 'sent') saved++;
			// Sent or refused for good: it goes, unless the member chose another answer meanwhile.
			const now = read(account);
			if (now[path] === answer) {
				delete now[path];
				write(account, now);
			}
		}
		return saved;
	})().finally(() => (sending = null));
	return sending;
}
