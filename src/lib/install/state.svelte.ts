import { detectDevice, INSTALLED_KEY, type Device } from './install.ts';

/** Chrome's and Edge's own install dialog, offered through an event that may come early (app.html keeps it). */
export type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

declare global {
	interface Window {
		__installPrompt?: InstallPromptEvent;
		__installed?: boolean;
	}
}

/**
 * The app on the home screen (#279), shared by the start page's hint, /install and the profile.
 * `installed`: opened from the home screen, or installed from this browser once (kept, so no
 * page asks again). `prompt`: the browser's own dialog, where there is one. Browser only.
 */
export const install = $state<{ device: Device | null; prompt: InstallPromptEvent | null; installed: boolean; standalone: boolean }>({
	device: null,
	prompt: null,
	installed: false,
	standalone: false
});

/** Once, from the layout: listens for the browser's events from here on. */
export function watchInstall(): () => void {
	install.device = detectDevice({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
	const modes = matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)');
	const update = () => {
		install.standalone = modes.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
		install.installed = install.standalone || window.__installed === true || remembered();
	};
	if (window.__installPrompt) install.prompt = window.__installPrompt;
	update();
	if (install.standalone) remember();

	const offer = (event: Event) => {
		event.preventDefault();
		install.prompt = event as InstallPromptEvent;
	};
	const done = () => {
		install.prompt = null;
		remember();
		update();
	};
	addEventListener('beforeinstallprompt', offer);
	addEventListener('appinstalled', done);
	modes.addEventListener('change', update);
	return () => {
		removeEventListener('beforeinstallprompt', offer);
		removeEventListener('appinstalled', done);
		modes.removeEventListener('change', update);
	};
}

/** Opens the browser's own dialog; "unavailable" where the browser has none (Safari, Firefox). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
	const prompt = install.prompt;
	if (!prompt) return 'unavailable';
	// Each event opens the dialog once.
	install.prompt = null;
	window.__installPrompt = undefined;
	await prompt.prompt();
	const { outcome } = await prompt.userChoice;
	if (outcome === 'accepted') {
		remember();
		install.installed = true;
	}
	return outcome;
}

function remembered() {
	try {
		return localStorage.getItem(INSTALLED_KEY) === '1';
	} catch {
		return false;
	}
}

function remember() {
	window.__installed = true;
	try {
		localStorage.setItem(INSTALLED_KEY, '1');
	} catch {
		// Then the hint may ask once more in the browser; from the home screen it never does.
	}
}
