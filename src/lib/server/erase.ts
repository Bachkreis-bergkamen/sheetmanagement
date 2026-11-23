import { normalizeEmail } from '#lib/access/access.ts';
import { ERASE_TABS, planErase, pseudonym, type TabErase } from '#lib/access/erase.ts';
import * as t from '#lib/i18n/texts.ts';
import { LAYOUT, type Table, type TabKey } from '#lib/repertoire/sheet.ts';
import { getStore } from './db/index.ts';
import { pollStore } from './polls.ts';
import { getAccessList } from './repertoire.ts';
import { lendingStore } from './lending.ts';
import { albumStore } from './album.ts';
import { dutyStore } from './duties.ts';
import { tripStore } from './trips.ts';
import { authorKey, kummerStore } from './kummer.ts';
import { deleteRows, readTab, SheetLayoutError, updateRecords } from './sheet-writes.ts';

/**
 * "Mitglied löschen" (#158): what the app keeps about one member, first as a preview, then
 * gone in one go: their rows in the sheet (see #lib/access/erase.ts), and in D1 their
 * devices, reminders, settings, practice time and marks, their poll answers, trip sign-ups and duties;
 * the instruments they borrowed stay on record under a pseudonym.
 */

/** One line of the preview: where, how many, and whether it goes or loses the name. */
export interface EraseItem {
	where: string;
	count: number;
	how: 'remove' | 'anonymise';
}

export interface ErasePreview {
	email: string;
	name: string;
	items: EraseItem[];
}

async function sheetTables() {
	const tables: Partial<Record<TabKey, Table<string>>> = {};
	await Promise.all(
		ERASE_TABS.map(async (key) => {
			// A tab the sheet doesn't have yet holds nothing about anyone.
			tables[key] = await readTab(key).catch((cause) => (cause instanceof SheetLayoutError ? undefined : Promise.reject(cause)));
		})
	);
	return tables;
}

/** The member's name as the sheet has it; notes are signed with it. */
function nameOf(email: string, tables: Partial<Record<TabKey, Table<string>>>) {
	return tables.members?.rows.find((row) => normalizeEmail(row.values.email ?? '') === email)?.values.name?.trim() ?? '';
}

const sheetItems = (plan: TabErase[]): EraseItem[] =>
	plan.map((change) => ({
		where: LAYOUT[change.key].tab,
		count: change.remove.length || change.anonymise.length,
		how: change.remove.length ? 'remove' : 'anonymise'
	}));

/** The member's threads in the Kummerkasten and the answers they gave there. */
async function kummerCount(email: string): Promise<number> {
	const store = kummerStore();
	const key = await authorKey(email);
	return store && key ? store.countBy(email, key) : 0;
}

async function storedItems(email: string): Promise<EraseItem[]> {
	const store = getStore();
	const [devices, reminders, optOut, tour, practiceOn, practice, marks, polls, kummer, drillSharing, drillConsent, trips, drillProgress, lent, duties, photos, album] = await Promise.all([
		store.pushOf(email),
		store.remindersOf(email),
		store.mailOptOuts(),
		store.tourOf(email),
		store.practiceOn(email),
		store.practiceOf(email),
		store.marksOf(email),
		pollStore()?.countBy(email) ?? 0,
		kummerCount(email),
		store.drillSharing(email),
		store.drillConsentOf(email),
		tripStore()?.countBy(email) ?? 0,
		store.drillProgressOf(email),
		lendingStore().then((lending) => lending?.countBy(email) ?? 0),
		dutyStore().then((store) => store?.countBy(email) ?? 0),
		store.photoConsentAll().then((all) => (all.has(email) ? 1 : 0)),
		albumStore().then((album) => album?.countBy(email) ?? 0)
	]);
	const items: EraseItem[] = [
		{ where: t.erase.stored.devices, count: devices.length, how: 'remove' },
		{ where: t.erase.stored.reminders, count: reminders.length, how: 'remove' },
		{ where: t.erase.stored.settings, count: [optOut.has(email), tour, practiceOn].filter(Boolean).length, how: 'remove' },
		{ where: t.erase.stored.practice, count: practice.length, how: 'remove' },
		{ where: t.erase.stored.drills, count: (drillSharing ? 1 : 0) + (drillConsent ? 1 : 0) + (drillProgress ? 1 : 0), how: 'remove' },
		{ where: t.erase.stored.marks, count: marks.length, how: 'remove' },
		{ where: t.erase.stored.polls, count: polls, how: 'anonymise' },
		{ where: t.erase.stored.trips, count: trips, how: 'remove' },
		{ where: t.lending.erased, count: lent, how: 'anonymise' },
		{ where: t.duties.erased, count: duties, how: 'remove' },
		{ where: t.photos.export, count: photos, how: 'remove' },
		{ where: t.album.erased, count: album, how: 'anonymise' },
		{ where: t.erase.stored.kummer, count: kummer, how: 'remove' }
	];
	return items.filter((item) => item.count > 0);
}

export async function previewErase(address: string): Promise<ErasePreview> {
	const email = normalizeEmail(address);
	const tables = await sheetTables();
	const name = nameOf(email, tables);
	const plan = planErase({ email, name }, tables, { id: 'preview', anonymous: t.erase.anonymous });
	return { email, name, items: [...sheetItems(plan), ...(await storedItems(email))] };
}

/**
 * Deletes and pseudonymises everything in the preview. D1 first: if the sheet fails
 * halfway, the member is still in "Mitglieder" (changed last) and the deletion can be run
 * again; what's done stays done.
 */
export async function eraseMember(address: string): Promise<ErasePreview> {
	const email = normalizeEmail(address);
	const done = await previewErase(email);
	const id = crypto.randomUUID().slice(0, 8);
	const stand = { email: pseudonym(id), name: t.erase.anonymous };

	const store = getStore();
	const devices = await store.pushOf(email);
	// Their other addresses (#190) may have password accounts of their own; all else is under `email`.
	const aliases = (await getAccessList())?.membersByEmail.get(email)?.aliases ?? [];
	await Promise.all([
		...devices.map((device) => store.deletePush(device.endpoint)),
		...aliases.map((alias) => store.deleteAccount(alias)),
		store.deleteRemindersOf(email),
		store.setMailOptOut(email, false),
		store.setTour(email, null),
		store.deleteAccount(email),
		store.setPracticeOn(email, false),
		store.deletePractice(email),
		store.setDrillSharing(email, { board: false, leaders: false, parents: false }),
		store.setDrillConsent(email, '', false),
		store.setDrillUnlocks(email, [], ''),
		store.setDrillProgress(email, null),
		store.setPhotoConsent(email, null, ''),
		store.deleteMarks(email),
		pollStore()?.forget(email, stand),
		tripStore()?.forget(email, stand),
		albumStore().then((album) => album?.forget(email, stand)),
		lendingStore().then((lending) => lending?.forget(email, stand)),
		dutyStore().then((store) => store?.forget(email)),
		authorKey(email).then((key) => (key ? kummerStore()?.forget(email, key, stand) : undefined))
	]);

	const tables = await sheetTables();
	for (const change of planErase({ email, name: done.name }, tables, { id, anonymous: stand.name })) {
		// The tab's key is only known at run time; the plan holds that tab's own columns.
		const table = tables[change.key] as Table<never>;
		await updateRecords(change.key, table, change.anonymise as never);
		await deleteRows(change.key, table, change.remove);
	}
	return done;
}
