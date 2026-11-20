import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('./env.ts')>()),
	appEnv: () => ({ DEMO: 'true' }),
	isDemo: () => true,
	runInBackground: (promise: Promise<unknown>) => void promise.catch(() => {})
}));

const { resetDemo } = await import('./demo/backend.ts');
const { DEMO_MEMBER } = await import('./demo/data.ts');
const { getLibrary } = await import('./library.ts');
const { getAccessList, getMusicConfig, getPartAssignments } = await import('./repertoire.ts');
const { getArchiveIndex } = await import('./services.ts');
const { pickConcerts, programFor, saidAt, upcomingParts } = await import('./my-concerts.ts');
const { buildSignups } = await import('#lib/signups/signups.ts');
const { LAYOUT } = await import('#lib/repertoire/sheet.ts');

/** Sign-ups as the sheet holds them: one row per person and date. */
const signupsOf = (rows: { eventId: string; email: string; instrument: string }[]) => {
	const c = LAYOUT.signups.columns;
	return buildSignups([
		[c.event, c.who, c.name, c.answer, c.instrument, c.comment, c.answeredAt, c.eventId],
		...rows.map((row) => ['', row.email, '', 'Zusage', row.instrument, '', '', row.eventId])
	]);
};

beforeEach(async () => {
	resetDemo();
	await getArchiveIndex({ force: true });
});

describe('upcomingParts', () => {
	it('keeps the member’s PDF parts of their next two concerts with a programme, each once', async () => {
		const [library, access, music, assignments] = await Promise.all([getLibrary(), getAccessList(), getMusicConfig(), getPartAssignments()]);
		const member = access!.membersByEmail.get(DEMO_MEMBER.email)!;
		const parts = upcomingParts(library, member, music, assignments.assignments);

		expect(parts.length).toBeGreaterThan(0);
		expect(new Set(parts.map((part) => part.id)).size).toBe(parts.length);
		const next = pickConcerts(library.concerts, library.today, null, member).shown.filter((concert) => programFor(concert, member).length);
		const pieces = new Set(next.slice(0, 2).flatMap((concert) => programFor(concert, member).map((item) => item.pieceId)));
		for (const part of parts) {
			expect(pieces.has(part.pieceId)).toBe(true);
			const detail = library.piecesById.get(part.pieceId)!.detail!;
			expect(detail.parts.find((p) => p.id === part.id)?.mimeType).toBe('application/pdf');
		}
		// A third concert's pieces only where they're played in the first two as well.
		const later = new Set(next.slice(2).flatMap((concert) => programFor(concert, member).map((item) => item.pieceId)));
		for (const id of later) if (!pieces.has(id)) expect(parts.some((part) => part.pieceId === id)).toBe(false);
	});

	it('keeps nothing for a member without an instrument', async () => {
		const [library, access, music, assignments] = await Promise.all([getLibrary(), getAccessList(), getMusicConfig(), getPartAssignments()]);
		const member = { ...access!.membersByEmail.get(DEMO_MEMBER.email)!, instrument: '' };
		expect(upcomingParts(library, member, music, assignments.assignments)).toEqual([]);
	});
});

describe('the part given with the answer to a date', () => {
	const signups = signupsOf([
		{ eventId: 'probe', email: 'Anna@example.org', instrument: '' },
		{ eventId: 'konzert', email: 'anna@example.org', instrument: 'Geige II' },
		{ eventId: 'konzert', email: 'ben@example.org', instrument: 'quatsch' }
	]);

	it('is the first date’s with one: a rehearsal without falls back to its concert', () => {
		expect(saidAt(signups, 'anna@example.org', ['probe', 'konzert'])).toEqual([{ instrument: 'Geige', numbers: [2] }]);
		expect(saidAt(signups, 'anna@example.org', ['probe'])).toEqual([]);
	});

	it('is nothing without sign-ups, an address, or a part the app can read', () => {
		expect(saidAt(null, 'anna@example.org', ['konzert'])).toEqual([]);
		expect(saidAt(signups, undefined, ['konzert'])).toEqual([]);
		expect(saidAt(signups, 'ben@example.org', ['konzert'])).toEqual([]);
	});

	it('keeps only that part offline for a member with several', async () => {
		const [library, access, music, assignments] = await Promise.all([getLibrary(), getAccessList(), getMusicConfig(), getPartAssignments()]);
		const member = { ...access!.membersByEmail.get(DEMO_MEMBER.email)!, instrument: 'Geige I & II' };
		const [next] = pickConcerts(library.concerts, library.today, null, member).shown.filter((concert) => programFor(concert, member).length);
		const pieces = new Set(programFor(next, member).map((item) => item.pieceId));
		const ofNext = (parts: { label: string; pieceId: string }[]) => parts.filter((part) => pieces.has(part.pieceId)).map((part) => part.label);

		const both = ofNext(upcomingParts(library, member, music, assignments.assignments, 1));
		const second = ofNext(
			upcomingParts(library, member, music, assignments.assignments, 1, signupsOf([{ eventId: next.id, email: member.email, instrument: 'Geige II' }]))
		);
		// Both violin parts without an answer, only the second with "Geige II".
		expect(both).toContain('Geige I');
		expect(both).toContain('Geige II');
		expect(second).toContain('Geige II');
		expect(second).not.toContain('Geige I');
	});
});
