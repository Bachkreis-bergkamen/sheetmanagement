import { fingerprint, type ErrorGroup } from '#lib/errors/errors.ts';
import { reminderKey, type Account, type MarkShare, type PageCount, type PageMarks, type PageRole, type PartCheck, type PushDevice, type Store, type TourOutcome } from './types.ts';
import { memoryData } from './data-memory.ts';
import { memoryTickets } from './tickets-memory.ts';
import { MIGRATIONS } from './sql.ts';

/** Like SQLite's datetime('now'). */
const sqlTime = (at: number) => new Date(at).toISOString().slice(0, 19).replace('T', ' ');

/** The store without D1: demo, tests, dev without Wrangler. Gone on restart, like the demo's sheet. */
export function memoryStore(now = () => Date.now()): Store {
	const push = new Map<string, PushDevice>();
	const sent = new Map<string, number>();
	const state = new Map<string, string>();
	const optOut = new Set<string>();
	const accounts = new Map<string, Account>();
	const tours = new Map<string, TourOutcome>();
	/** Page openings by day, route and role, as a JSON key. */
	const pageViews = new Map<string, number>();
	const practiceOptIn = new Set<string>();
	/** Seconds by member, then by day. */
	const practice = new Map<string, Map<string, number>>();
	/** Marks by member, then by `${page} ${file}`. */
	const marks = new Map<string, Map<string, PageMarks>>();
	/** Offers by id; answers as `${id} ${email}`. */
	const shares = new Map<string, MarkShare>();
	const answers = new Set<string>();
	const hits = new Map<string, { count: number; since: number }>();
	const partChecks = new Map<string, PartCheck>();
	const errors = new Map<string, ErrorGroup>();
	const daysAgo = (days: number) => sqlTime(now() - days * 86_400_000);
	const latest = MIGRATIONS.at(-1)?.[0] ?? null;

	return {
		kind: 'memory',
		schemaVersion: async () => latest,
		migrate: async () => [],

		async savePush(device) {
			push.set(device.endpoint, { ...device, createdAt: push.get(device.endpoint)?.createdAt ?? sqlTime(now()) });
		},
		async deletePush(endpoint) {
			push.delete(endpoint);
		},
		pushOf: async (email) => [...push.values()].filter((device) => device.email === email),
		allPush: async () => [...push.values()],

		async sentReminders(kind, subjects) {
			const wanted = new Set(subjects);
			return new Set(
				[...sent.keys()].filter((key) => key.startsWith(`${kind}\n`) && wanted.has(key.split('\n')[1])).map((key) => key.slice(kind.length + 1))
			);
		},
		async logReminder(kind, subject, recipient) {
			const key = `${kind}\n${reminderKey(subject, recipient)}`;
			if (!sent.has(key)) sent.set(key, now());
		},
		async remindersOf(recipient) {
			return [...sent]
				.map(([key, at]) => ({ parts: key.split('\n'), at }))
				.filter(({ parts }) => parts[2] === recipient)
				.map(({ parts, at }) => ({ kind: parts[0], subject: parts[1], sentAt: sqlTime(at) }));
		},
		async deleteRemindersOf(recipient) {
			for (const key of sent.keys()) if (key.split('\n')[2] === recipient) sent.delete(key);
		},
		async pruneReminders(days) {
			for (const [key, at] of sent) if (at < now() - days * 86_400_000) sent.delete(key);
		},

		mailOptOuts: async () => new Set(optOut),
		async setMailOptOut(email, off) {
			if (off) optOut.add(email);
			else optOut.delete(email);
		},

		accountOf: async (email) => {
			const account = accounts.get(email);
			return account ? { ...account } : null;
		},
		async saveAccount(account) {
			accounts.set(account.email, { ...account });
		},
		async deleteAccount(email) {
			accounts.delete(email);
		},

		async countPage(day, route, role) {
			const key = JSON.stringify([day, route, role]);
			pageViews.set(key, (pageViews.get(key) ?? 0) + 1);
		},
		async pageCounts(since) {
			const sums = new Map<string, PageCount>();
			for (const [key, views] of pageViews) {
				const [day, route, role] = JSON.parse(key) as [string, string, PageRole];
				if (day < since) continue;
				const sum = sums.get(route + ' ' + role) ?? { route, role, views: 0 };
				sum.views += views;
				sums.set(route + ' ' + role, sum);
			}
			return [...sums.values()].sort((a, b) => b.views - a.views || a.route.localeCompare(b.route) || a.role.localeCompare(b.role));
		},
		async prunePageCounts(before) {
			for (const key of pageViews.keys()) if ((JSON.parse(key) as string[])[0] < before) pageViews.delete(key);
		},

		tourOf: async (email) => tours.get(email) ?? null,
		async setTour(email, outcome) {
			if (outcome) tours.set(email, outcome);
			else tours.delete(email);
		},

		practiceOn: async (email) => practiceOptIn.has(email),
		async setPracticeOn(email, on) {
			if (on) practiceOptIn.add(email);
			else practiceOptIn.delete(email);
		},
		async addPractice(email, day, seconds, cap) {
			const days = practice.get(email) ?? new Map<string, number>();
			days.set(day, Math.min(cap, (days.get(day) ?? 0) + seconds));
			practice.set(email, days);
		},
		practiceOf: async (email) =>
			[...(practice.get(email) ?? [])].map(([day, seconds]) => ({ day, seconds })).sort((a, b) => a.day.localeCompare(b.day)),
		async deletePractice(email) {
			practice.delete(email);
		},
		marksOf: async (email, file) =>
			[...(marks.get(email)?.values() ?? [])]
				.filter((page) => file === undefined || page.file === file)
				.sort((a, b) => a.file.localeCompare(b.file) || a.page - b.page),
		async saveMarks(email, file, page, strokes) {
			const pages = marks.get(email) ?? new Map<string, PageMarks>();
			if (strokes.length) pages.set(`${page} ${file}`, { file, page, strokes });
			else pages.delete(`${page} ${file}`);
			marks.set(email, pages);
		},
		async deleteMarks(email) {
			marks.delete(email);
			for (const share of [...shares.values()]) if (share.sender === email) await this.unshareMarks(email, share.file);
			for (const answer of [...answers]) if (answer.endsWith(` ${email}`)) answers.delete(answer);
		},

		async shareMarks(sender, file, pages) {
			await this.unshareMarks(sender, file);
			const share: MarkShare = { id: crypto.randomUUID(), sender, file, pages: structuredClone(pages), at: sqlTime(now()) };
			shares.set(share.id, share);
			return structuredClone(share);
		},
		async unshareMarks(sender, file) {
			for (const [id, share] of shares) {
				if (share.sender !== sender || share.file !== file) continue;
				shares.delete(id);
				for (const answer of [...answers]) if (answer.startsWith(`${id} `)) answers.delete(answer);
			}
		},
		shareById: async (id) => structuredClone(shares.get(id) ?? null),
		shareOf: async (sender, file) => structuredClone([...shares.values()].find((share) => share.sender === sender && share.file === file) ?? null),
		sharesFor: async (email, file) =>
			structuredClone(
				[...shares.values()]
					.filter((share) => share.file === file && share.sender !== email && !answers.has(`${share.id} ${email}`))
					.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
			),
		async answerShare(id, email) {
			answers.add(`${id} ${email}`);
		},

		partChecks: async () => [...partChecks.values()],
		async savePartCheck(check) {
			const old = partChecks.get(check.fileId);
			partChecks.set(check.fileId, { ...check, dismissed: !!old?.dismissed && old.modified === check.modified });
		},
		async dismissPartCheck(fileId) {
			const old = partChecks.get(fileId);
			if (old) partChecks.set(fileId, { ...old, dismissed: true });
		},
		async clearPartChecks() {
			partChecks.clear();
		},

		async logError(report) {
			const key = fingerprint(report);
			const old = errors.get(key);
			const at = sqlTime(now());
			errors.set(key, old ? { ...old, count: old.count + 1, lastAt: at, status: report.status } : { ...report, fingerprint: key, count: 1, firstAt: at, lastAt: at, notified: false });
		},
		errorLog: async (days) =>
			[...errors.values()]
				.filter((group) => group.lastAt >= daysAgo(days))
				.sort((a, b) => b.lastAt.localeCompare(a.lastAt))
				.slice(0, 200),
		async markErrorsNotified(fingerprints) {
			for (const key of fingerprints) {
				const group = errors.get(key);
				if (group) errors.set(key, { ...group, notified: true });
			}
		},
		async pruneErrors(days) {
			for (const [key, group] of errors) if (days <= 0 || group.lastAt < daysAgo(days)) errors.delete(key);
		},

		// The orchestra's data (#186).
		...memoryData(),
		...memoryTickets(),

		async hit(key, windowMinutes) {
			const last = hits.get(key);
			const next = last && last.since >= now() - windowMinutes * 60_000 ? { ...last, count: last.count + 1 } : { count: 1, since: now() };
			hits.set(key, next);
			return next.count;
		},

		getState: async (key) => state.get(key) ?? null,
		async setState(key, value) {
			state.set(key, value);
		}
	};
}
