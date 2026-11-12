import { getStore } from './db/index.ts';
import { appEnv, isDemo } from './env.ts';
import { legalContact } from './legal.ts';
import { mailReady } from './mail/index.ts';
import { pushReady } from './push/index.ts';
import { driveWriteEnabled } from './services.ts';

/**
 * The optional services on /status: which ones this deployment has, and where the guide says
 * how to set up the rest. Only what the settings show; whether each one works is for the
 * checks above it on the page.
 */

export const EXTRAS = ['currentProgram', 'driveWrite', 'youtube', 'push', 'database', 'legal', 'email'] as const;
export type Extra = (typeof EXTRAS)[number];

const GUIDE = 'https://github.com/Bachkreis-bergkamen/sheetmanagement/blob/main/docs/setup-google.md';

/** Each extra's section in docs/setup-google.md, step 10. */
export const EXTRA_GUIDES: Record<Extra, string> = {
	currentProgram: `${GUIDE}#current-programme-folders`,
	driveWrite: `${GUIDE}#drive-writing`,
	youtube: `${GUIDE}#youtube-durations`,
	push: `${GUIDE}#notifications`,
	database: `${GUIDE}#database-d1`,
	legal: `${GUIDE}#privacy-contact`,
	email: `${GUIDE}#email`
};

/** Not in the app yet, whatever the settings say. */
const PLANNED = new Set<Extra>();

export interface ExtraState {
	key: Extra;
	state: 'on' | 'off' | 'planned';
	guide: string;
}

export async function extras(): Promise<ExtraState[]> {
	const env = appEnv();
	const legal = legalContact();
	const on: Record<Extra, boolean> = {
		currentProgram: !!env.DRIVE_CURRENT_PROGRAM_FOLDER_ID?.trim(),
		driveWrite: driveWriteEnabled(),
		youtube: !!env.YOUTUBE_API_KEY?.trim(),
		push: pushReady(),
		database: !isDemo() && getStore().kind === 'd1',
		legal: !!legal.email && !!legal.address,
		email: await mailReady()
	};
	return EXTRAS.map((key) => ({ key, state: PLANNED.has(key) ? 'planned' : on[key] ? 'on' : 'off', guide: EXTRA_GUIDES[key] }));
}
