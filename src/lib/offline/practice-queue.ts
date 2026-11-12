/**
 * Practice time that couldn't reach the server (#304): offline, a failed request or a busy
 * server. Kept on the device per part and sent later in one report each, so an evening of
 * practice on a bad connection still counts. Kept in localStorage: it's a few numbers, and the
 * report sent when the page closes can still write it.
 */
import { MAX_QUEUED_SECONDS } from '#lib/practice/practice.ts';
import { readLocalJson, writeLocal } from '#lib/local-storage.ts';

/** Per account, so time kept on a shared device never counts for the next one who signs in there. */
const keyOf = (account: string) => `practice-pending:${account.toLowerCase()}`;

/** Seconds per part file, waiting to be sent. */
export type PracticeQueue = Record<string, number>;

/** The queue with `seconds` more for `file`; at most one opening's worth per part. */
export function addToQueue(queue: PracticeQueue, file: string, seconds: number): PracticeQueue {
	if (!(seconds > 0)) return queue;
	return { ...queue, [file]: Math.min(MAX_QUEUED_SECONDS, (queue[file] ?? 0) + Math.round(seconds)) };
}

/**
 * What a report's answer means for time waiting on the device: sent and counted, refused for good
 * (practice time off, not their part, signed out), or to try again later.
 */
export function outcome(status: number): 'sent' | 'refused' | 'retry' {
	if (status >= 200 && status < 300) return 'sent';
	if (status === 403 || status === 404 || status === 409) return 'refused';
	return 'retry';
}

function read(account: string): PracticeQueue {
	const parsed = readLocalJson(keyOf(account));
	if (!parsed || typeof parsed !== 'object') return {};
	return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0));
}

/** Without storage the time is lost, as before. */
function write(account: string, queue: PracticeQueue) {
	writeLocal(keyOf(account), Object.keys(queue).length ? JSON.stringify(queue) : null);
}

/** Keeps seconds for a part on the device until they can be sent. */
export function queuePractice(account: string, file: string, seconds: number) {
	write(account, addToQueue(read(account), file, seconds));
}

let sending: Promise<void> | null = null;

/** Sends what's waiting, one report per part; what can't go yet stays. */
export function sendQueuedPractice(account: string): Promise<void> {
	if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve();
	sending ??= (async () => {
		for (const [file, seconds] of Object.entries(read(account))) {
			let result: 'sent' | 'refused' | 'retry';
			try {
				const response = await fetch('/api/ueben', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ file, seconds, queued: true })
				});
				result = outcome(response.status);
			} catch {
				result = 'retry';
			}
			if (result === 'retry') break;
			// Sent or refused for good: it goes. Time added meanwhile for the same part stays.
			const now = read(account);
			const left = (now[file] ?? 0) - seconds;
			if (left > 0) now[file] = left;
			else delete now[file];
			write(account, now);
		}
	})().finally(() => (sending = null));
	return sending;
}
