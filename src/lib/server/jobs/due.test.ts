import { describe, expect, it, vi } from 'vitest';

vi.mock('../env.ts', () => ({ appEnv: () => ({}) }));
vi.mock('./warm.ts', () => ({ warmCaches: vi.fn() }));
vi.mock('./reminders.ts', () => ({ sendReminders: vi.fn() }));
vi.mock('./check.ts', () => ({ checkConnections: vi.fn() }));
vi.mock('./parts.ts', () => ({ checkParts: vi.fn() }));
vi.mock('./retention.ts', () => ({ applyRetention: vi.fn() }));
vi.mock('./errors.ts', () => ({ announceErrors: vi.fn() }));
vi.mock('./export.ts', () => ({ exportData: vi.fn() }));
vi.mock('./backup.ts', () => ({ backupData: vi.fn() }));
vi.mock('./tickets.ts', () => ({ pruneTicketOrders: vi.fn() }));
vi.mock('./trips.ts', () => ({ pruneTripLists: vi.fn() }));

const { dueJobs } = await import('./index.ts');

const minutes = (n: number) => n * 60 * 1000;
const run = (at: number) => ({ at, ms: 10, ok: true, summary: '', auto: true });

describe('dueJobs', () => {
	const now = minutes(1000);

	const recent = { reminders: run(now - minutes(1)), check: run(now - minutes(60)), parts: run(now - minutes(1)), retention: run(now - minutes(60)), errors: run(now - minutes(1)), export: run(now - minutes(60)), backup: run(now - minutes(60)), tickets: run(now - minutes(60)), trips: run(now - minutes(60)) };

	it('runs a job that never ran', () => {
		expect(dueJobs({}, now)).toEqual(['warm', 'reminders', 'check', 'parts', 'retention', 'errors', 'export', 'backup', 'tickets', 'trips']);
	});

	it('waits until the interval has passed, with a minute of slack', () => {
		expect(dueJobs({ ...recent, warm: run(now - minutes(5)) }, now)).toEqual([]);
		// The trigger fires a few seconds early: still due.
		expect(dueJobs({ ...recent, warm: run(now - minutes(10) + 20_000) }, now)).toEqual(['warm']);
		expect(dueJobs({ ...recent, warm: run(now - minutes(30)) }, now)).toEqual(['warm']);
	});

	it('runs the connection check once a day', () => {
		const warm = run(now - minutes(1));
		expect(dueJobs({ warm, reminders: warm, parts: warm, retention: warm, errors: warm, export: warm, backup: warm, tickets: warm, trips: warm, check: run(now - minutes(23 * 60)) }, now)).toEqual([]);
		expect(dueJobs({ warm, reminders: warm, parts: warm, retention: warm, errors: warm, export: warm, backup: warm, tickets: warm, trips: warm, check: run(now - minutes(24 * 60)) }, now)).toEqual(['check']);
	});
});
