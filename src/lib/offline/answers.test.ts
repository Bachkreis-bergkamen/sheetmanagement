import { describe, expect, it } from 'vitest';
import { actionPath, outcome, parseQueue } from './answers.svelte.ts';

describe('actionPath', () => {
	it("resolves a form's action against the page it's on", () => {
		expect(actionPath('?/answer', 'https://noten.example/kalender/abc')).toBe('/kalender/abc?/answer');
		expect(actionPath('/kalender/a%20b?/answer', 'https://noten.example/')).toBe('/kalender/a%20b?/answer');
	});
});

describe('parseQueue', () => {
	it('keeps answers to dates', () => {
		expect(parseQueue({ '/kalender/abc?/answer': 'yes', '/kalender/x_1?/answer': 'no' })).toEqual({ '/kalender/abc?/answer': 'yes', '/kalender/x_1?/answer': 'no' });
	});

	it('drops anything else: other paths, other actions, unknown answers', () => {
		expect(parseQueue({ '/admin?/remove': 'yes', '/kalender/abc?/withdraw': 'yes', '/kalender/abc?/answer': 'sure', 'https://elsewhere.example/kalender/a?/answer': 'yes' })).toEqual({});
		expect(parseQueue(null)).toEqual({});
		expect(parseQueue('yes')).toEqual({});
	});
});

describe('outcome', () => {
	it('is sent when the action succeeded', () => {
		expect(outcome(200, { type: 'success', status: 200 })).toBe('sent');
	});

	it('is refused for good when the date has passed or sign-ups are off', () => {
		expect(outcome(200, { type: 'failure', status: 404 })).toBe('refused');
		expect(outcome(200, { type: 'failure', status: 400 })).toBe('refused');
		expect(outcome(200, { type: 'failure', status: 409 })).toBe('refused');
	});

	it('tries again when the server is busy, the member is signed out or the answer is no JSON', () => {
		expect(outcome(200, { type: 'failure', status: 503 })).toBe('retry');
		expect(outcome(200, { type: 'failure', status: 403 })).toBe('retry');
		expect(outcome(200, { type: 'redirect', status: 303, location: '/anmelden' })).toBe('retry');
		expect(outcome(500, { type: 'error', status: 500 })).toBe('retry');
		expect(outcome(200, null)).toBe('retry');
	});
});
