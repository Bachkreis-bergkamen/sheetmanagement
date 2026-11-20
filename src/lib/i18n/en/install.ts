import type { Texts } from '../types.ts';

/** The app on the home screen (#279): the start page's hint, /install and the profile's entry. */
export const install: Texts['install'] = {
	title: (name: string) => `${name} on your phone`,
	entryHint: 'Installing and help',
	entryInstalled: 'Installed · guide and help',
	pageTitle: 'Install the app',
	lead: (name: string) => `Put ${name} on your home screen. Then it opens with one tap, like any other app.`,
	shareDescription: 'Parts, rehearsals and concerts as an app on your phone, set up in a minute.',
	benefits: {
		parts: { title: 'Your parts in one tap', body: 'Dates and parts open at once, without searching in the browser.' },
		offline: { title: 'Without reception too', body: 'Saved parts and recently opened pages work in the rehearsal hall without reception.' },
		reminders: { title: 'Reminders', body: 'On the iPhone, notifications only work for the app on the home screen.' }
	},
	hint: {
		title: (name: string) => `Install the ${name} app`,
		body: 'Your parts, dates and concert details, always at hand.',
		install: 'Install now',
		later: 'Later',
		never: 'Don’t ask again'
	},
	device: 'Your device',
	platforms: { ios: 'iPhone, iPad', android: 'Android', desktop: 'Computer' },
	oneTap: {
		title: 'Install with one tap',
		body: 'Your browser can install the app directly. It asks once, then the app is on your home screen.',
		button: 'Install now',
		manual: 'Step by step instead'
	},
	step: (n: number, of: number) => `Step ${n} of ${of}`,
	back: 'Back',
	next: 'Next',
	finish: 'Done',
	restart: 'Start again',
	notSafari: 'On the iPhone this works most reliably in Safari. Copy the link and open it there.',
	fromApp: 'Coming from WhatsApp? Tap the compass icon at the bottom right or “Open in Safari”.',
	otherAndroid: 'This page is open in another app’s browser. Tap the three dots and “Open in browser” to continue in Chrome.',
	samsung: 'Samsung Internet warns about an old Android version when installing; that comes from the browser, not the app. It’s best to open the page in Chrome.',
	firefox: 'Firefox can’t install web apps on a computer. Open the page in Chrome or Edge, or bookmark it.',
	copyLink: 'Copy link',
	copied: 'Copied',
	steps: {
		ios: [
			{ title: 'Tap “Share”', body: 'The square with an arrow pointing up, in Safari’s bar. If you don’t see it, tap the three dots at the bottom right first.' },
			{ title: 'Choose “Add to Home Screen”', body: 'Swipe the list up a little until you see “Add to Home Screen”, and tap it.' },
			{ title: 'Tap “Add”', body: 'At the top right. You can keep the name.' }
		],
		iosMenu: [
			{ title: 'Tap the three dots', body: 'At the bottom right, next to the address.' },
			{ title: 'Tap “Share”', body: 'At the top of the menu.' },
			{ title: 'Choose “Add to Home Screen”', body: 'Swipe the list up. If it isn’t there, tap “More” first.' },
			{ title: 'Tap “Add”', body: 'Leave “Open as Web App” on. Then tap “Add” at the top right.' }
		],
		android: [
			{ title: 'Open the menu', body: 'Tap the three dots at the top right.' },
			{ title: 'Choose “Install app”', body: 'Depending on the version it’s called “Add to Home screen”.' },
			{ title: 'Tap “Install”', body: 'Wait a moment: the icon appears on your home screen.' }
		],
		desktop: [
			{ title: 'Click the install icon', body: 'On the right of the address bar: a screen with an arrow. Or in the menu (three dots), “Install page as app”.' },
			{ title: 'Click “Install”', body: 'The app opens in its own window and is then in the start menu or the dock.' }
		],
		mac: [
			{ title: 'Open the “File” menu', body: 'In Safari’s menu bar at the top.' },
			{ title: 'Choose “Add to Dock”', body: 'Then click “Add”. This works from macOS Sonoma on.' }
		]
	},
	done: {
		title: 'All done!',
		body: (name: string) => `${name} is now on your home screen. Open it directly any time and use your parts offline too.`
	},
	standalone: { title: 'You’re already using the app', body: 'You opened it from the home screen. There’s nothing left to do.' },
	manualDone: {
		title: 'Look at your home screen',
		body: (name: string) => `The ${name} icon should be there now. Open the app from it from now on: everything is one tap away, even without reception.`
	},
	open: 'Go to the app'
};
