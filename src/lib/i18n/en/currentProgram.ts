import type { Texts } from '../types.ts';

export const currentProgram: Texts['currentProgram'] = {
	title: 'Current programme in Drive',
	sync: 'Sync',
	noFolder: (name: string) => `No programme folder for ${name} yet – syncing adds the shortcuts.`,
	complete: (count: number, folder: string) => `All ${count} pieces are in the programme folder “${folder}”.`,
	partly: (linked: number, total: number, folder: string) => `${linked} of ${total} pieces are in the programme folder “${folder}”.`,
	extra: (count: number) => (count === 1 ? '1 other piece is still in it.' : `${count} other pieces are still in it.`),
	notNext: 'Not this orchestra’s next concert.',
	done: (added: number, removed: number) => `Synced: ${added} added, ${removed} taken out.`,
	removedHint: 'Shortcuts taken out are in the bin.',
	stuck: (names: string[]) => `Only whoever made it can take out ${names.map((name) => `“${name}”`).join(', ')}: please delete by hand in Drive.`,
	open: 'Open folder',
	failed: 'Syncing didn’t work. Is the service account an editor of the folder?',
	ambiguous: 'Several programme folders and no orchestra on the concert: please enter the orchestra in the sheet.',
	none: 'There’s no programme folder for this orchestra, and DRIVE_CURRENT_PROGRAM_FOLDER_ID names no folder to make one in.',
	autoDone: 'Also synced to the Drive folder “Aktuelles Programm”.',
	autoFailed: 'The programme couldn’t be synced to the Drive folder “Aktuelles Programm”.'
};
