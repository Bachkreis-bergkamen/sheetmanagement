import { defineConfig, devices } from '@playwright/test';
import { DEMO_PORT } from './e2e/ports.ts';

/**
 * End-to-end tests against the demo (#142): sample data in memory, no Google account.
 * `pnpm test:e2e` starts the demo on its own ports; the tests reset its data first.
 * One demo server per worker; E2E_WORKERS=1 runs the tests one after another.
 */
const DEMO_SERVERS = Number(process.env.E2E_WORKERS) || 3;

export default defineConfig({
	testDir: 'e2e',
	// The demo keeps its data in memory, one set per server: each worker gets a demo of its own
	// (e2e/demo.ts), so the tests run side by side without touching each other's data.
	workers: DEMO_SERVERS,
	fullyParallel: true,
	retries: process.env.CI ? 1 : 0,
	// Short, so a broken page fails in seconds rather than holding the run up for a minute a test.
	timeout: 30_000,
	expect: { timeout: 8_000 },
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		locale: 'de-DE',
		timezoneId: 'Europe/Berlin',
		screenshot: 'only-on-failure',
		// A trace costs time on every test; only the retry of a failed one records it (CI retries once).
		trace: 'on-first-retry',
		// The tests check pages, not the offline cache.
		serviceWorkers: 'block'
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		// The flows test what a click saves, the same on any screen; the phone checks the pages' layout,
		// navigation and accessibility, the tour's cards over them, the practice viewer by touch, and installing on the home screen.
		{ name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: ['pages.spec.ts', 'tour.spec.ts', 'practice.spec.ts', 'install.spec.ts'] }
	],
	webServer: Array.from({ length: DEMO_SERVERS }, (_, index) => ({
		command: `pnpm exec vite dev --mode demo --port ${DEMO_PORT + index} --strictPort`,
		url: `http://localhost:${DEMO_PORT + index}/api/health`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}))
});
