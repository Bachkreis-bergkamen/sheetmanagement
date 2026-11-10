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
const { pickConcerts, programFor, upcomingParts } = await import('./my-concerts.ts');

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
