import { describe, expect, it } from 'vitest';
import { linkToken } from './links.ts';
import { answerToken, readAnswerToken } from './mail-links.ts';
import { readSetPasswordToken, setPasswordToken } from './password.ts';

const secret = 'x'.repeat(32);
const now = Date.parse('2026-10-23T10:00:00Z');

describe('links in emails (#123)', () => {
	it('are never taken for another kind of link', async () => {
		const answer = await answerToken('mia@example.org', 'event-1', now + 86_400_000, secret);
		expect(await readSetPasswordToken(answer, secret, now)).toBeNull();
		expect(await readSetPasswordToken(await linkToken('mia@example.org', 1, secret), secret, now)).toBeNull();
		expect(await readAnswerToken(await setPasswordToken('mia@example.org', '', secret, now), secret, now)).toBeNull();
	});

	it('answer one event until it is over', async () => {
		const token = await answerToken('mia@example.org', 'event-1', now + 86_400_000, secret);
		expect(await readAnswerToken(token, secret, now)).toEqual({ email: 'mia@example.org', eventId: 'event-1' });
		expect(await readAnswerToken(token, secret, now + 2 * 86_400_000)).toBeNull();
	});
});
