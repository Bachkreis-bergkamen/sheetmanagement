import type { Texts } from '../types.ts';

export const naming: Texts['naming'] = {
	title: 'File names',
	lead: 'Files not named “<Short title> - <Part>.pdf”, with a suggestion. Only what is ticked is renamed.',
	counts: (rename: number, unclear: number, folders: number) =>
		`${rename} ${rename === 1 ? 'suggestion' : 'suggestions'} · ${unclear} unclear · in ${folders} ${folders === 1 ? 'folder' : 'folders'}`,
	shortTitle: 'Short title',
	openFolder: 'Folder in Drive',
	shortTitleHint: 'Comes before every part. Keep it short so the part stays readable on a phone.',
	long: 'long for phones',
	unclear: 'unclear',
	unclearHint: (words: string) => `Not recognised: ${words}. Please rename by hand.`,
	takenHint: (name: string) => `“${name}” already exists. Please rename by hand.`,
	nothingHint: 'No part recognised. Please rename by hand.',
	rename: (n: number) => (n === 1 ? 'Rename 1 file' : `Rename ${n} files`),
	renamedIn: (n: number, folder: string) => `${n === 1 ? '1 file' : `${n} files`} renamed in “${folder}”.`,
	all: 'Select all',
	none: 'Every file name follows the convention.',
	onlyUnclear: 'Only unclear ones left',
	noDriveWrite: 'Renaming is off: the app may only read Drive (DRIVE_WRITE is not set).',
	progress: (done: number, total: number) => `Renaming: ${done} of ${total} …`,
	gone: 'This folder no longer exists. Please reload the page.',
	failed: (names: string[]) => `Not renamed: ${names.join(', ')}`,
	filter: { all: 'All folders', rename: 'With suggestions', unclear: 'With unclear files' },
	failedLoad: "The library couldn't be loaded just now."
};
