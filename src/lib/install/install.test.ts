import { describe, expect, it } from 'vitest';
import { canInstall, detectDevice, dismissal, hintDue, SNOOZE_DAYS } from './install.ts';

const UA = {
	iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
	iphoneSafari26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
	iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
	iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0',
	ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
	androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
	androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
	androidWebView: 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36',
	windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
	windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
	macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
};

describe('detectDevice', () => {
	it('knows iPhones, and Safari from the other browsers there', () => {
		expect(detectDevice({ userAgent: UA.iphoneSafari })).toEqual({ platform: 'ios', browser: 'safari', safariMenu: false });
		expect(detectDevice({ userAgent: UA.iphoneChrome }).browser).toBe('chrome');
		expect(detectDevice({ userAgent: UA.iphoneInstagram }).browser).toBe('other');
	});

	it('sees Safari 26’s "•••" menu by Safari’s version, not the frozen system one', () => {
		expect(detectDevice({ userAgent: UA.iphoneSafari26 }).safariMenu).toBe(true);
	});

	it('tells an iPad from a Mac by its touch screen', () => {
		expect(detectDevice({ userAgent: UA.ipad, maxTouchPoints: 5 }).platform).toBe('ios');
		expect(detectDevice({ userAgent: UA.macSafari, maxTouchPoints: 0 })).toEqual({ platform: 'desktop', browser: 'safari', safariMenu: false });
	});

	it('knows Android’s browsers, and an app’s own browser', () => {
		expect(detectDevice({ userAgent: UA.androidChrome }).browser).toBe('chrome');
		expect(detectDevice({ userAgent: UA.androidSamsung }).browser).toBe('samsung');
		expect(detectDevice({ userAgent: UA.androidWebView }).browser).toBe('other');
	});

	it('knows desktop browsers, and which can install', () => {
		expect(detectDevice({ userAgent: UA.windowsEdge }).browser).toBe('edge');
		expect(canInstall(detectDevice({ userAgent: UA.windowsEdge }))).toBe(true);
		expect(canInstall(detectDevice({ userAgent: UA.windowsFirefox }))).toBe(false);
		expect(canInstall(detectDevice({ userAgent: UA.iphoneInstagram }))).toBe(false);
	});
});

describe('hintDue', () => {
	const now = Date.UTC(2026, 10, 6);
	it('asks the first time, and not again before "Später" runs out', () => {
		expect(hintDue(null, now)).toBe(true);
		const later = dismissal('later', now);
		expect(hintDue(later, now + 1000)).toBe(false);
		expect(hintDue(later, now + SNOOZE_DAYS * 24 * 60 * 60 * 1000)).toBe(true);
	});

	it('never asks again after "Nicht mehr fragen"', () => {
		expect(hintDue(dismissal('never', now), now + 10 ** 12)).toBe(false);
	});

	it('asks again when what’s stored makes no sense', () => {
		expect(hintDue('soon', now)).toBe(true);
	});
});
