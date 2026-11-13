import { appEnv } from '../env.ts';
import { checkConnections } from './check.ts';
import { backupData } from './backup.ts';
import { announceErrors } from './errors.ts';
import { exportData } from './export.ts';
import { checkParts } from './parts.ts';
import { applyRetention } from './retention.ts';
import { sendReminders } from './reminders.ts';
import { pruneTicketOrders } from './tickets.ts';
import { pruneTripLists } from './trips.ts';
import { warmCaches } from './warm.ts';

/**
 * Work that runs on a schedule, not when someone opens a page (#160): one Cron Trigger
 * (wrangler.toml) calls /api/jobs every few minutes, which runs the jobs that are due.
 * Each job is a plain function that /status can also start by hand. A job stays within
 * the free plan's CPU limit: it does a small step and leaves the rest for the next run.
 */

export interface JobResult {
	ok: boolean;
	/** One line for /status. */
	summary: string;
}

interface Job {
	/** Runs when its last run is at least this old. */
	everyMinutes: number;
	run: () => Promise<JobResult>;
}

export const JOBS = {
	warm: { everyMinutes: 10, run: warmCaches },
	reminders: { everyMinutes: 30, run: () => sendReminders() },
	check: { everyMinutes: 24 * 60, run: checkConnections },
	parts: { everyMinutes: 10, run: () => checkParts() },
	retention: { everyMinutes: 24 * 60, run: applyRetention },
	errors: { everyMinutes: 60, run: announceErrors },
	export: { everyMinutes: 24 * 60, run: exportData },
	backup: { everyMinutes: 7 * 24 * 60, run: backupData },
	tickets: { everyMinutes: 24 * 60, run: () => pruneTicketOrders() },
	trips: { everyMinutes: 24 * 60, run: () => pruneTripLists() }
} satisfies Record<string, Job>;

export type JobName = keyof typeof JOBS;
export const JOB_NAMES = Object.keys(JOBS) as JobName[];

export function isJobName(name: string): name is JobName {
	return (JOB_NAMES as string[]).includes(name);
}

export interface JobRun extends JobResult {
	at: number;
	ms: number;
	/** By the Cron Trigger, or by hand on /status. */
	auto: boolean;
}

export type JobRuns = Partial<Record<JobName, JobRun>>;

/** A minute of slack: the trigger doesn't fire on the exact second. */
const SLACK_MS = 60 * 1000;

export function dueJobs(runs: JobRuns, now: number): JobName[] {
	return JOB_NAMES.filter((name) => {
		const last = runs[name];
		return !last || now - last.at >= JOBS[name].everyMinutes * 60 * 1000 - SLACK_MS;
	});
}

// Last runs live in KV, shared by all Worker instances; without KV (dev, demo) in memory.
// One small write per run: every 10 minutes is 144 of the 1,000 free writes a day.
const KEY = 'jobs:runs:v1';
let memory: JobRuns = {};

export async function lastRuns(): Promise<JobRuns> {
	const kv = appEnv().CACHE;
	if (!kv) return memory;
	return ((await kv.get(KEY, 'json').catch(() => null)) as JobRuns | null) ?? memory;
}

async function saveRun(name: JobName, run: JobRun) {
	const runs = { ...(await lastRuns()), [name]: run };
	memory = runs;
	await appEnv().CACHE?.put(KEY, JSON.stringify(runs));
}

export async function runJob(name: JobName, auto: boolean): Promise<JobRun> {
	const started = Date.now();
	let result: JobResult;
	try {
		result = await JOBS[name].run();
	} catch (cause) {
		console.error(`Job ${name} failed:`, cause);
		result = { ok: false, summary: cause instanceof Error ? cause.message : String(cause) };
	}
	const run: JobRun = { ok: result.ok, summary: result.summary, at: started, ms: Date.now() - started, auto };
	await saveRun(name, run).catch((cause: unknown) => console.error(`Saving the run of ${name} failed:`, cause));
	return run;
}

/** What the Cron Trigger calls: every due job, one after another. */
export async function runDueJobs(now = Date.now()): Promise<JobRuns> {
	const done: JobRuns = {};
	for (const name of dueJobs(await lastRuns(), now)) done[name] = await runJob(name, true);
	return done;
}
