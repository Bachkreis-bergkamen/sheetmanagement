import { normalizeEmail } from '#lib/access/access.ts';
import { signToken, verifyToken } from './session.ts';

/**
 * Links in a reminder email (#123) that answer one sign-up, signed with SESSION_SECRET and
 * nothing stored. Each purpose is signed separately, so one kind of link is never taken for
 * another. (Links to set a password are in password.ts.)
 */

const ANSWER = 'signup-answer';

interface SignInData {
	e: string;
	/** Expiry, seconds since the epoch. */
	x: number;
}

interface AnswerData extends SignInData {
	/** The event's id. */
	ev: string;
}

const seconds = (ms: number) => Math.floor(ms / 1000);

/** Answering one event from a reminder; valid until `until` (the event's end, roughly). */
export const answerToken = (email: string, eventId: string, until: number, secret: string) =>
	signToken(ANSWER, { e: normalizeEmail(email), ev: eventId, x: seconds(until) } satisfies AnswerData, secret);

export async function readAnswerToken(token: string, secret: string, now = Date.now()): Promise<{ email: string; eventId: string } | null> {
	const data = await verifyToken<AnswerData>(ANSWER, token, secret);
	if (!data || typeof data.e !== 'string' || typeof data.ev !== 'string' || typeof data.x !== 'number' || data.x < seconds(now)) return null;
	return { email: normalizeEmail(data.e), eventId: data.ev };
}
