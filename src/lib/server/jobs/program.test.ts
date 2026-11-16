import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../env.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('../env.ts')>()),
	appEnv: () => ({ DEMO: 'true' }),
	isDemo: () => true,
	runInBackground: (promise: Promise<unknown>) => void promise.catch(() => {})
}));

const { config } = await import('#lib/config/index.ts');
const { demoClient, resetDemo } = await import('../demo/backend.ts');
const { listChildren } = await import('../google/drive.ts');
const { getLibrary, programOf } = await import('../library.ts');
const { getArchiveIndex } = await import('../services.ts');
const { currentProgramInStep, currentProgramStatus, nextConcert, syncCurrentProgram } = await import('../current-program.ts');
const { rollCurrentProgram } = await import('./program.ts');

beforeEach(async () => {
	resetDemo();
	await getArchiveIndex({ force: true });
});

/** The pieces a programme folder links to, by their archive folder ids. */
async function linked(folderUrl: string): Promise<string[]> {
	const id = folderUrl.split('/').pop()!;
	return (await listChildren(demoClient(), [id])).flatMap((entry) => (entry.shortcutDetails ? [entry.shortcutDetails.targetId] : [])).sort();
}

describe('rollCurrentProgram', () => {
	it('swaps the last concert’s pieces for the next one’s, and then leaves the folder alone', async () => {
		const orchestra = config.orchestras[0];
		let library = await getLibrary();
		const next = nextConcert(library, orchestra);
		expect(next).toBeDefined();
		// The folder still holds another concert's programme, as on the morning after it.
		const last = library.concerts.find((c) => c.id !== next!.id && programOf(c, orchestra).some((item) => !programOf(next!, orchestra).some((other) => other.pieceId === item.pieceId)));
		expect(last).toBeDefined();
		const before = await syncCurrentProgram(last!, library, orchestra);

		const rolled = await rollCurrentProgram();
		expect(rolled.ok).toBe(true);
		expect(rolled.summary).toContain(next!.title);

		library = await getLibrary();
		const wanted = programOf(next!, orchestra).flatMap((item) => (item.pieceId && library.piecesById.get(item.pieceId)?.detail ? [item.pieceId] : []));
		expect(await linked(before.folderUrl)).toEqual([...new Set(wanted)].sort());
		expect(currentProgramInStep(currentProgramStatus(next!, library, orchestra))).toBe(true);

		// In step: no Drive request at all.
		const client = demoClient() as unknown as { fetchImpl: typeof fetch };
		const fetchImpl = client.fetchImpl;
		let driveRequests = 0;
		client.fetchImpl = (input, init) => {
			if (String(input).includes('/drive/v3/')) driveRequests++;
			return fetchImpl(input, init);
		};
		const again = await rollCurrentProgram();
		client.fetchImpl = fetchImpl;
		expect(again.ok).toBe(true);
		expect(driveRequests).toBe(0);
	});

	// In My Drive only a shortcut's owner may bin it: those made by hand stay next to the new
	// ones, and the run said nothing about it.
	it('names the shortcuts it may not take out, and is not ok', async () => {
		const orchestra = config.orchestras[0];
		const library = await getLibrary();
		const next = nextConcert(library, orchestra);
		const last = library.concerts.find((c) => c.id !== next!.id && programOf(c, orchestra).some((item) => !programOf(next!, orchestra).some((other) => other.pieceId === item.pieceId)));
		const before = await syncCurrentProgram(last!, library, orchestra);

		const client = demoClient() as unknown as { fetchImpl: typeof fetch };
		const fetchImpl = client.fetchImpl;
		client.fetchImpl = (input, init) => {
			if (init?.method === 'PATCH' && String(init.body).includes('"trashed":true')) {
				return Promise.resolve(Response.json({ error: { message: 'The user does not have sufficient permissions for this file.' } }, { status: 403 }));
			}
			return fetchImpl(input, init);
		};
		const rolled = await rollCurrentProgram();
		client.fetchImpl = fetchImpl;

		expect(rolled.ok).toBe(false);
		expect(rolled.summary).toContain(before.folderName);
		const left = programOf(last!, orchestra).filter((item) => !programOf(next!, orchestra).some((other) => other.pieceId === item.pieceId));
		const name = library.piecesById.get(left.find((item) => item.pieceId && library.piecesById.get(item.pieceId)?.detail)!.pieceId!)!.detail!.folderName;
		expect(rolled.summary).toContain(name);
	});
});
