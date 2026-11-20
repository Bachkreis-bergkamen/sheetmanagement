import type { Texts } from '../types.ts';

export const erase: Texts['erase'] = {
	anonymous: 'Former member',
	button: 'Delete all data …',
	title: (name: string) => `Delete all data of ${name}`,
	lead: 'For a request to be deleted (Art. 17 GDPR). What only concerns this person is deleted. Where a row also counts for others (sign-ups, attendance, +1, notes), it stays without the name, so counts and the season report stay right.',
	nothing: 'Apart from the row in “Members” there is no data about this person.',
	remove: (count: number) => (count === 1 ? '1 entry is deleted' : `${count} entries are deleted`),
	anonymise: (count: number) => (count === 1 ? '1 entry stays without the name' : `${count} entries stay without the name`),
	confirm: 'Delete for good',
	confirmQuestion: (name: string) => `Delete all data of ${name} for good? This can't be undone.`,
	done: (name: string) => `The data of ${name} is deleted.`,
	failed: "The deletion didn't fully work. What's done stays done; please try again.",
	stored: {
		devices: 'Devices for notifications',
		reminders: 'Reminders sent',
		settings: 'Settings (emails, tour, practice time)',
		practice: 'Practice time (days)',
		drills: 'Practice area (progress, shared summary, parents’ consent)',
		marks: 'Own marks in parts (pages)',
		polls: 'Date polls',
		trips: 'Trips (sign-ups, lists and instruments deleted, organising without name)',
		kummer: 'Suggestion box (own messages deleted, answers without name)'
	}
};
