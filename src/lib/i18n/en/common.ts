import type { Texts } from '../types.ts';

export const common: Texts['common'] = {
	comingSoon: 'Coming soon',
	backHome: 'To the overview',
	loading: 'Page loading',
	saveFailed: "Saving didn't work. What you entered is still there – please try again.",
	saveUnavailable: "Google isn't answering, nothing was saved. What you entered is still there.",
	stillSaving: 'This is still being saved. Wait a moment, then tap again.',
	sheetChanged: 'Someone has changed this in the sheet in the meantime. Reload the page and make your change again.',
	sheetBusy: 'Many people are saving at the same time. Please try again in a moment.',
	unsaved: "Your changes aren't saved yet. Leave the page anyway?",
	share: 'Share',
	copied: 'Copied. Now paste it, e.g. in WhatsApp.',
	copyFailed: "Copying didn't work.",
	quote: (text: string) => `“${text}”`
};
