import { dayKey, type DrillData } from '#lib/practice/drills/progress.ts';
import { summaryRows } from '#lib/practice/drills/sharing.ts';

type Fetch = typeof fetch;

const post = (fetcher: Fetch, url: string, body: unknown) =>
	fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true });

/**
 * The time of the rounds to the member's practice time, so their tree grows with it. Answers
 * the seconds no longer to send and how many of them were counted: a refusal because practice
 * time was turned off meanwhile leaves nothing to send either. Nothing while offline, kept for
 * the next time.
 */
export async function sendTime(unsent: number, fetcher: Fetch = fetch): Promise<{ done: number; counted: number }> {
	const seconds = Math.round(unsent);
	if (seconds < 1) return { done: 0, counted: 0 };
	try {
		const response = await post(fetcher, '/api/ueben/runde', { seconds });
		if (response.ok) return { done: seconds, counted: seconds };
		if (response.status === 409) return { done: seconds, counted: 0 };
	} catch {
		// Offline.
	}
	return { done: 0, counted: 0 };
}

/**
 * The summary for those the member shares with (#300): the last four weeks per day and skill,
 * replacing what was sent before. False when the server says nothing is shared any more.
 */
export async function sendDays(days: DrillData['days'], fetcher: Fetch = fetch, today = dayKey()): Promise<boolean> {
	try {
		const response = await post(fetcher, '/api/ueben/tage', { rows: summaryRows(days, today) });
		return response.status !== 409;
	} catch {
		// Offline: sent with the next round.
		return true;
	}
}
