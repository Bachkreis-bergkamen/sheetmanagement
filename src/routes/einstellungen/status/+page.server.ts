import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isJobName, JOB_NAMES, JOBS, lastRuns, runJob, type JobName } from '#lib/server/jobs/index.ts';
import { config } from '#lib/config/index.ts';
import { contrast } from '#lib/branding.ts';
import { FEATURES } from '#lib/features.ts';
import { t } from '#lib/i18n/index.ts';
import { appEnv, features, isDemo, orchestra, unknownFeatures } from '#lib/server/env.ts';
import { getStore } from '#lib/server/db/index.ts';
import { usingD1 } from '#lib/server/data-source.ts';
import { KEEP_ERRORS_DAYS } from '#lib/server/jobs/errors.ts';
import { pushReady } from '#lib/server/push/index.ts';
import { disconnectMail, mailAccount, mailError } from '#lib/server/mail/index.ts';
import { canConnectDrive, disconnectDrive, driveAccount } from '#lib/server/drive-account.ts';
import { extras } from '#lib/server/extras.ts';
import { authConfig, requireAdminWhenSignInIsOn } from '#lib/server/auth/index.ts';
import { GoogleApiError } from '#lib/server/google/client.ts';
import { listEvents } from '#lib/server/google/calendar.ts';
import { ACCESS_TABS } from '#lib/access/access.ts';
import { LAYOUT, REPERTOIRE_TABS, type TabKey } from '#lib/repertoire/sheet.ts';
import { getSpreadsheetInfo } from '#lib/server/google/sheets.ts';
import { freshness } from '#lib/server/version-check.ts';
import { APP_COMMIT, versionLabel, versionUrl } from '#lib/version.ts';
import { getRepertoire } from '#lib/server/repertoire.ts';
import { driveWriteEnabled, getArchiveIndex, getGoogle, NotConfiguredError, requireSetting } from '#lib/server/services.ts';

/** Manual refreshes are ignored when the index is younger than this, to protect API and KV quotas. */
const MIN_REFRESH_AGE_MS = 60 * 1000;

export type CheckState = 'ok' | 'error' | 'missing';

export interface Check {
	state: CheckState;
	/** Short facts shown when the check passed. */
	details: string[];
	/** What went wrong, in plain words. */
	problem?: string;
	/** What to do about it. */
	hint?: string;
	/** Another word for the state than "Verbunden", "Fehler" … */
	pill?: string;
	/** A page with more, e.g. the changes on GitHub. */
	link?: { href: string; label: string };
}

function describeError(error: unknown, what: string, serviceAccountEmail?: string): Check {
	if (error instanceof NotConfiguredError) {
		return { state: 'missing', details: [], problem: t.messages.notSet(error.variable) };
	}
	if (error instanceof GoogleApiError && (error.status === 403 || error.status === 404)) {
		return {
			state: 'error',
			details: [],
			problem: t.status.noAccess(what, error.status),
			hint: serviceAccountEmail ? t.status.shareWith(what, serviceAccountEmail) : t.status.checkShare
		};
	}
	return { state: 'error', details: [], problem: error instanceof Error ? error.message : String(error) };
}

/** The deployment's colours with their contrast (#75) and the parts of the app that are off (#134). */
function lookCheck(): Check {
	const { colours, badAccent, presetLight } = orchestra();
	const ratio = (value: number) => new Intl.NumberFormat(config.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
	const off = FEATURES.filter((feature) => !features()[feature]).map((feature) => t.features[feature]);
	const unknown = unknownFeatures();
	const problems = [
		...(badAccent ? [t.status.badAccent(appEnv().ORCHESTRA_ACCENT?.trim() ?? '')] : []),
		...(unknown.length ? [t.status.unknownFeatures(unknown.join(', '))] : [])
	];
	return {
		state: problems.length ? 'error' : 'ok',
		details: [
			presetLight
				? t.status.accentPreset(colours.dark, ratio(contrast(colours.dark, '#0b0b0a')))
				: t.status.accent(colours.light, ratio(contrast(colours.light, '#f4f4f1')), colours.dark, ratio(contrast(colours.dark, '#0b0b0a'))),
			...((colours.adjusted.light && !presetLight) || colours.adjusted.dark ? [t.status.accentAdjusted] : []),
			off.length ? t.status.featuresOff(off.join(', ')) : t.status.allFeatures
		],
		problem: problems.join(' ') || undefined,
		hint: unknown.length ? t.status.featuresHint : undefined
	};
}

const dateTime = new Intl.DateTimeFormat(config.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: config.timeZone });
const dateOnly = new Intl.DateTimeFormat(config.locale, { dateStyle: 'medium', timeZone: 'UTC' });

export const load: PageServerLoad = async ({ url, locals }) => {
	requireAdminWhenSignInIsOn(locals);
	let serviceAccountEmail: string | undefined;
	const account: Check = await (async () => {
		try {
			const { client, serviceAccountEmail: email } = getGoogle();
			serviceAccountEmail = email;
			// A cheap call that proves the key works: the token request itself.
			await client.request('https://www.googleapis.com/drive/v3/about', { params: { fields: 'user(emailAddress)' } });
			return { state: 'ok', details: [t.status.serviceAccount(email), t.status.driveAccess(driveWriteEnabled())] } satisfies Check;
		} catch (error) {
			const check = describeError(error, t.status.what.account, serviceAccountEmail);
			if (check.state === 'error') {
				check.hint = t.status.keyHint;
			}
			return check;
		}
	})();

	const googleReady = account.state === 'ok';
	const skipped: Check = { state: 'missing', details: [], problem: t.status.accountFirst };

	const [drive, calendar, sheet] = await Promise.all([
		googleReady
			? (async (): Promise<Check> => {
					try {
						let result = await getArchiveIndex();
						const refresh = url.searchParams.has('refresh');
						if (refresh && Date.now() - result.storedAt > MIN_REFRESH_AGE_MS) {
							result = await getArchiveIndex({ force: true });
						}
						const index = result.value;
						const files = index.pieces.reduce((sum, piece) => sum + piece.files.length, 0);
						const categories = [...new Set(index.pieces.map((p) => p.category).filter(Boolean))];
						return {
							state: 'ok',
							details: [
								t.status.archiveCounts(index.pieces.length, files),
								...(categories.length ? [t.status.categories(categories.join(', '))] : []),
							...(index.programs.length
								? [
										t.status.programs(
											index.programs
												.map((program) => `${program} (${index.pieces.filter((p) => p.programs?.includes(program)).length})`)
												.join(', ')
										)
									]
								: []),
								t.status.indexed(dateTime.format(new Date(result.storedAt)), result.source === 'fresh', index.requestCount)
							]
						};
					} catch (error) {
						return describeError(error, t.status.what.drive, serviceAccountEmail);
					}
				})()
			: skipped,
		googleReady
			? (async (): Promise<Check> => {
					try {
						const { client } = getGoogle();
						const from = new Date();
						const to = new Date(from.getTime() + 120 * 24 * 60 * 60 * 1000);
						const events = await listEvents(client, requireSetting('CALENDAR_ID'), { from, to });
						const next = events[0];
						return {
							state: 'ok',
							details: [
								t.status.events(events.length),
								...(next
									? [
											t.status.nextEvent(
												next.title,
												next.allDay ? dateOnly.format(new Date(next.start)) : dateTime.format(new Date(next.start))
											)
										]
									: [])
							]
						};
					} catch (error) {
						return describeError(error, t.status.what.calendar, serviceAccountEmail);
					}
				})()
			: skipped,
		googleReady
			? (async (): Promise<Check> => {
					try {
						const info = await getSpreadsheetInfo(getGoogle().client, requireSetting('REPERTOIRE_SHEET_ID'));
						const title = t.common.quote(info.title);
						const missing = (keys: readonly TabKey[]) =>
							keys.map((key) => LAYOUT[key].tab).filter((tab) => !info.tabs.includes(tab));
						const setupHint = t.status.setupHint;
						const missingRepertoire = missing(REPERTOIRE_TABS);
						if (missingRepertoire.length) {
							return {
								state: 'missing',
								details: [title],
								problem: t.status.missingTabs(missingRepertoire.join(', ')),
								hint: setupHint
							};
						}
						const result = await getRepertoire();
						if (!result.ok) return { state: 'error', details: [title], problem: t.status.sheetUnreadable };
						const { pieces, concerts, problems } = result.repertoire;
						// Without the access tabs the repertoire works; only sign-in needs them.
						const missingAccess = missing(ACCESS_TABS);
						return {
							state: 'ok',
							details: [
								title,
								t.status.sheetCounts(pieces.length, concerts.length),
								...((await usingD1()) ? [t.dataMove.sourceD1] : []),
								...(problems.length ? [t.status.sheetProblems(problems.length)] : [])
							],
							...(missingAccess.length
								? { problem: t.status.accessTabsMissing(missingAccess.join(', ')), hint: setupHint }
								: {})
						};
					} catch (error) {
						const check = describeError(error, t.status.what.sheet, serviceAccountEmail);
						if (check.state === 'missing') check.hint = t.status.sheetMissingHint;
						if (check.state === 'error' && serviceAccountEmail) {
							check.hint = t.status.sheetShare(serviceAccountEmail);
						}
						return check;
					}
				})()
			: skipped
	]);

	const auth = authConfig();
	const signIn: Check =
		auth.mode === 'off'
			? auth.reason === 'disabled'
				? {
						state: 'error',
						details: [],
						problem: t.status.signInDisabled,
						hint: t.status.signInDisabledHint
					}
				: {
						state: 'missing',
						details: [],
						problem: t.status.signInMissing,
						hint: t.status.signInMissingHint
					}
			: {
					state: auth.problems.length ? 'error' : 'ok',
					details: [
						t.status.redirectUri(`${url.origin}/auth/callback`),
						t.status.bootstrapAdmins(auth.bootstrapAdmins.length)
					],
					problem: auth.problems.join(' ') || undefined
				};

	const mail = await mailCheck();
	return {
		checks: {
			account,
			drive,
			calendar,
			sheet,
			signIn,
			look: lookCheck(),
			jobs: await jobsCheck(),
			store: await storeCheck(),
			errors: await errorsCheck(),
			push: await pushCheck(),
			mail: mail.check,
			version: await versionCheck()
		},
		mail: { connected: mail.connected, canConnect: mail.canConnect, result: url.searchParams.get('mail') },
		// The account new uploads belong to (#193); only with DRIVE_WRITE, where uploading exists.
		drive: driveWriteEnabled() && canConnectDrive() ? { account: await driveAccount(), result: url.searchParams.get('drive') } : null,
		jobs: JOB_NAMES,
		extras: await extras()
	};
};

export const actions: Actions = {
	/** Forgets the account that sends email (#123); Google keeps the permission until it's removed there too. */
	disconnectMail: async ({ locals }) => {
		requireAdminWhenSignInIsOn(locals);
		await disconnectMail();
		return { mailDisconnected: true };
	},

	/** Forgets the account new uploads belong to (#193). */
	disconnectDrive: async ({ locals }) => {
		requireAdminWhenSignInIsOn(locals);
		await disconnectDrive();
		return { driveDisconnected: true };
	},

	/** Empties the error log (#191) once the errors in it are dealt with. */
	clearErrors: async ({ locals }) => {
		requireAdminWhenSignInIsOn(locals);
		await getStore().pruneErrors(0);
		return { errorsCleared: true };
	},

	/** Starts a job by hand (#160), e.g. to try it after a deploy or in the demo. */
	runJob: async ({ request, locals }) => {
		requireAdminWhenSignInIsOn(locals);
		const name = String((await request.formData()).get('job') ?? '');
		if (!isJobName(name)) return fail(400);
		const run = await runJob(name, false);
		return { job: name, ok: run.ok, summary: run.summary };
	}
};

/** Which version runs, and whether GitHub has a newer one (#206). */
async function versionCheck(): Promise<Check> {
	const running = t.status.versionRunning(versionLabel());
	const link = { href: versionUrl(), label: 'GitHub' };
	if (!APP_COMMIT) return { state: 'missing', pill: '–', details: [running], problem: t.status.versionNoCommit, link };
	const fresh = await freshness(APP_COMMIT);
	if (!fresh) return { state: 'ok', pill: '–', details: [running, t.status.versionUnchecked], link };
	if (fresh.behind) {
		return {
			state: 'missing',
			pill: t.status.versionUpdate,
			details: [running],
			problem: t.status.versionBehind(fresh.behind),
			hint: t.status.versionBehindHint,
			link: { href: fresh.url, label: 'GitHub' }
		};
	}
	return {
		state: 'ok',
		pill: t.status.versionCurrent,
		details: [running, fresh.ahead ? t.status.versionAhead(fresh.ahead) : t.status.versionUpToDate],
		link
	};
}

/** Where the app keeps what it writes itself (#161), and its schema version. */
async function storeCheck(): Promise<Check> {
	const store = getStore();
	if (store.kind === 'memory') {
		return isDemo()
			? { state: 'ok', details: [t.status.storeDemo] }
			: { state: 'missing', details: [], problem: t.status.storeMemory, hint: t.status.storeMemoryHint };
	}
	try {
		const version = await store.schemaVersion();
		if (!version) return { state: 'missing', details: [], problem: t.status.storeNoSchema, hint: t.status.storeNoSchemaHint };
		return { state: 'ok', details: [t.status.storeD1(version)] };
	} catch (error) {
		return { state: 'error', details: [], problem: t.status.storeFailed(error instanceof Error ? error.message : String(error)) };
	}
}

/** Errors on the server and in members' browsers by kind (#191); recent ones are a problem. */
async function errorsCheck(): Promise<Check> {
	const log = await getStore()
		.errorLog(KEEP_ERRORS_DAYS)
		.catch(() => null);
	if (!log) return { state: 'error', details: [], problem: t.status.storeFailed('') };
	if (!log.length) return { state: 'ok', pill: '0', details: [t.status.errorsNone(KEEP_ERRORS_DAYS)] };
	const dayAgo = new Date(Date.now() - 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
	const recent = log.filter((group) => group.lastAt >= dayAgo).length;
	return {
		state: recent ? 'error' : 'ok',
		pill: String(log.length),
		details: log
			.slice(0, 10)
			.map((group) => t.status.errorLine(group.count, t.status.errorSources[group.source], group.place, group.message, dateTime.format(new Date(`${group.lastAt.replace(' ', 'T')}Z`)))),
		problem: recent ? t.status.errorsRecent(recent) : undefined,
		hint: t.status.errorsHint
	};
}

/** Whether notifications can be sent (#157), and to how many devices. */
async function pushCheck(): Promise<Check> {
	if (!pushReady()) return { state: 'missing', details: [], problem: t.status.pushMissing, hint: t.status.pushMissingHint };
	const devices = await getStore()
		.allPush()
		.catch(() => []);
	return { state: 'ok', details: [t.status.pushOn(devices.length)] };
}

/** The account that sends sign-in links and reminders by email (#123). */
async function mailCheck(): Promise<{ check: Check; connected: boolean; canConnect: boolean }> {
	const auth = authConfig();
	const canConnect = auth.mode === 'on' && !auth.problems.length && !isDemo();
	if (!canConnect) return { check: { state: 'missing', details: [], problem: t.email.notConnected, hint: isDemo() ? undefined : t.email.needsSignIn }, connected: false, canConnect };
	const account = await mailAccount();
	if (!account) return { check: { state: 'missing', details: [], problem: t.email.notConnected, hint: t.email.connectHint }, connected: false, canConnect };
	const [lastError, optOut] = await Promise.all([mailError(), getStore().mailOptOuts().catch(() => new Set<string>())]);
	return {
		check: {
			state: lastError ? 'error' : 'ok',
			details: [
				t.email.connected(account.email, dateOnly.format(new Date(account.connectedAt))),
				t.email.links(account.origin),
				...(optOut.size ? [t.email.optOuts(optOut.size)] : [])
			],
			problem: lastError ? (lastError === 'revoked' ? t.email.revoked : t.email.lastError(lastError)) : undefined
		},
		connected: true,
		canConnect
	};
}

/** When the jobs last ran; a trigger that stopped firing shows as an error (#160). */
async function jobsCheck(): Promise<Check> {
	const runs = await lastRuns();
	const label = (name: JobName) => t.status.jobNames[name];
	const failed = JOB_NAMES.filter((name) => runs[name] && !runs[name].ok);
	const lastAuto = Math.max(0, ...JOB_NAMES.map((name) => (runs[name]?.auto ? runs[name].at : 0)));
	const longest = Math.max(...JOB_NAMES.map((name) => JOBS[name].everyMinutes));
	const stale = lastAuto > 0 && Date.now() - lastAuto > 3 * longest * 60 * 1000;
	return {
		state: failed.length || stale ? 'error' : lastAuto ? 'ok' : 'missing',
		details: JOB_NAMES.map((name) => {
			const run = runs[name];
			return run ? `${t.status.jobRun(label(name), dateTime.format(new Date(run.at)), run.auto, run.ms)} · ${run.summary}` : t.status.jobNever(label(name));
		}),
		problem:
			[
				...failed.map((name) => t.status.jobFailed(label(name), runs[name]!.summary)),
				...(stale ? [t.status.jobsStale(dateTime.format(new Date(lastAuto)))] : []),
				...(lastAuto ? [] : [t.status.jobsNever])
			].join(' ') || undefined,
		hint: stale ? t.status.jobsStaleHint : lastAuto ? undefined : t.status.jobsNeverHint
	};
}
