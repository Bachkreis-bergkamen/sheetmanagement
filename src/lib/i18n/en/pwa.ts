import type { Texts } from '../types.ts';

export const pwa: Texts['pwa'] = {
	description: "The orchestra's music, rehearsals and concerts, offline in the rehearsal room too.",
	offline: "Offline: you're seeing the last version loaded. Parts saved for offline use can be opened.",
	save: 'Save offline',
	saving: (done: number, total: number) => `Saving ${done} of ${total} …`,
	saved: (n: number) => (n === 1 ? '1 part saved offline' : `${n} parts saved offline`),
	update: 'Update offline copy',
	newVersion: 'New version available',
	reload: 'Reload',
	remove: 'Delete offline copy',
	failed: (n: number) => (n === 1 ? "1 part couldn't be saved." : `${n} parts couldn't be saved.`),
	hint: 'Your parts on this device, for a rehearsal room without a connection.',
	unsupported: "This browser can't save music offline.",
	offlineBadge: 'offline',
	savePart: (label: string) => `Save ${label} offline`,
	removePart: (label: string) => `${label}: delete offline copy`,
	shelf: {
		title: 'Offline on this device',
		lead: 'These parts open without a connection too. You can save any part on its piece’s page.',
		count: (n: number) => (n === 1 ? '1 part' : `${n} parts`),
		view: (label: string) => `Open ${label} to practise`,
		removeAll: 'Delete all',
		confirmRemoveAll: 'Delete all parts saved offline from this device?'
	}
};
