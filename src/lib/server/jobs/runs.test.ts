import { describe, expect, it, vi } from 'vitest';

const puts: string[] = [];
let stored: string | null = null;
const CACHE = {
	get: async () => (stored ? JSON.parse(stored) : null),
	put: async (_key: string, value: string) => {
		puts.push(value);
		stored = value;
	}
};

vi.mock('../env.ts', () => ({ appEnv: () => ({ CACHE }) }));
const ok = async () => ({ ok: true, summary: 'done' });
vi.mock('./warm.ts', () => ({ warmCaches: ok }));
vi.mock('./reminders.ts', () => ({ sendReminders: ok }));
vi.mock('./check.ts', () => ({ checkConnections: ok }));
vi.mock('./parts.ts', () => ({
	checkParts: async () => {
		throw new Error('Drive is down');
	}
}));
vi.mock('./retention.ts', () => ({ applyRetention: ok }));
vi.mock('./errors.ts', () => ({ announceErrors: ok }));
vi.mock('./export.ts', () => ({ exportData: ok }));
vi.mock('./backup.ts', () => ({ backupData: ok }));
vi.mock('./tickets.ts', () => ({ pruneTicketOrders: ok }));
vi.mock('./trips.ts', () => ({ pruneTripLists: ok }));

const { JOB_NAMES, lastRuns, runDueJobs, runJob } = await import('./index.ts');

describe('the last runs in KV (#348)', () => {
	it('writes once for a run of the trigger, however many jobs were due', async () => {
		const done = await runDueJobs();
		expect(Object.keys(done)).toEqual(JOB_NAMES);
		expect(puts).toHaveLength(1);
		const runs = await lastRuns();
		expect(Object.keys(runs)).toEqual(JOB_NAMES);
		// A job that threw is recorded as failed, and doesn't stop the others.
		expect(runs.parts).toMatchObject({ ok: false, summary: 'Drive is down', auto: true });
		expect(runs.trips).toMatchObject({ ok: true, auto: true });
	});

	it('writes nothing when no job is due', async () => {
		puts.length = 0;
		expect(await runDueJobs()).toEqual({});
		expect(puts).toHaveLength(0);
	});

	it('keeps the other jobs\' runs when one is started by hand', async () => {
		puts.length = 0;
		const run = await runJob('check', false);
		expect(run).toMatchObject({ ok: true, auto: false });
		expect(puts).toHaveLength(1);
		const runs = await lastRuns();
		expect(runs.check?.auto).toBe(false);
		expect(runs.warm?.auto).toBe(true);
	});
});
