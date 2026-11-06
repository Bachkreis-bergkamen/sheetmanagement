/**
 * Installing the app on the home screen (#279): which device and browser this is, so the guide
 * shows the right steps, and how often the start page's hint may ask. Pure, for the tests; the
 * browser's events live in state.svelte.ts.
 */

export type InstallPlatform = 'ios' | 'android' | 'desktop';
export type InstallBrowser = 'safari' | 'chrome' | 'edge' | 'samsung' | 'firefox' | 'other';

export interface Device {
	platform: InstallPlatform;
	browser: InstallBrowser;
	/**
	 * Safari 26 and later (iOS 26) moved "Teilen" into the "•••" menu; the guide adds that tap.
	 * The system's version is frozen in the user agent since then, Safari's own isn't.
	 */
	safariMenu: boolean;
}

/**
 * From what the browser says about itself. iPads since iPadOS 13 call themselves a Mac;
 * their touch screen gives them away. Apps' built-in browsers (WhatsApp, Instagram, the
 * Google app) count as "other": they can't install, the guide sends people to Safari or Chrome.
 */
export function detectDevice({ userAgent, maxTouchPoints = 0 }: { userAgent: string; maxTouchPoints?: number }): Device {
	const ua = userAgent;
	const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
	const safariVersion = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0);
	if (ios) {
		const browser: InstallBrowser = /CriOS/.test(ua)
			? 'chrome'
			: /EdgiOS/.test(ua)
				? 'edge'
				: /FxiOS/.test(ua)
					? 'firefox'
					: /Version\/[\d.]+.*Safari\//.test(ua) && !/FBAN|FBAV|Instagram|GSA\/|Line\//.test(ua)
						? 'safari'
						: 'other';
		return { platform: 'ios', browser, safariMenu: browser === 'safari' && safariVersion >= 26 };
	}
	if (/Android/.test(ua)) {
		const browser: InstallBrowser = /SamsungBrowser/.test(ua)
			? 'samsung'
			: /Firefox/.test(ua)
				? 'firefox'
				: /EdgA/.test(ua)
					? 'edge'
					: // A WebView ("; wv)") is an app's own browser, not Chrome.
						/Chrome\//.test(ua) && !/; wv\)|FBAN|FBAV|Instagram/.test(ua)
						? 'chrome'
						: 'other';
		return { platform: 'android', browser, safariMenu: false };
	}
	const browser: InstallBrowser = /Edg\//.test(ua)
		? 'edge'
		: /Firefox\//.test(ua)
			? 'firefox'
			: /Chrome\//.test(ua)
				? 'chrome'
				: /Safari\//.test(ua)
					? 'safari'
					: 'other';
	return { platform: 'desktop', browser, safariMenu: false };
}

/** Whether this browser can put the app on the home screen or desktop at all. */
export function canInstall(device: Device): boolean {
	if (device.platform === 'ios') return device.browser !== 'other';
	if (device.platform === 'android') return device.browser !== 'other';
	return device.browser === 'chrome' || device.browser === 'edge' || device.browser === 'safari';
}

/** Where the start page's hint keeps "Später" and "Nicht mehr fragen"; where "installed" is kept. */
export const INSTALL_HINT_KEY = 'install-hint';
export const INSTALLED_KEY = 'installed';

/** "Später" asks again after this long; often enough to be found, rarely enough not to nag. */
export const SNOOZE_DAYS = 30;

/** What to store for "Später" (a time) or "Nicht mehr fragen". */
export function dismissal(kind: 'later' | 'never', now: number): string {
	return kind === 'never' ? 'never' : String(now + SNOOZE_DAYS * 24 * 60 * 60 * 1000);
}

/** Whether the hint may ask now: not after "Nicht mehr fragen", not before "Später" has run out. */
export function hintDue(stored: string | null, now: number): boolean {
	if (!stored) return true;
	if (stored === 'never') return false;
	const until = Number(stored);
	return !Number.isFinite(until) || now >= until;
}
