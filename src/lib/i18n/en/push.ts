import type { Texts } from '../types.ts';

/** Allowing notifications on /profil (#157). */
export const push: Texts['push'] = {
	title: 'Notifications',
	lead: "Reminds you on this device of rehearsals and concerts you haven't answered yet, and tells you when your wishes get an answer. If you look after rented music or run the app, you also hear about returns, new wishes and outages.",
	enable: 'Allow notifications',
	disable: 'Turn off',
	test: 'Send a test',
	on: 'On for this device.',
	elsewhere: (n: number) => (n === 1 ? 'On for 1 other device.' : `On for ${n} other devices.`),
	denied: "Notifications are blocked for this site. Allow them in the browser's site settings.",
	unsupported: "This browser can't receive notifications.",
	installFirst: 'On iPhone and iPad, notifications only work once the app is on the home screen (Share → “Add to Home Screen”).',
	failed: "That didn't work. Please try again.",
	testTitle: 'Test',
	testBody: 'This is what reminders look like on this device.',
	testSent: "Sent. If nothing arrives, check the device's notification settings.",
	hint: 'Applies to this device. Signing out turns it off here.'
};
