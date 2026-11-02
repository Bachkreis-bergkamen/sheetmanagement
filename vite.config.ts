import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };
import { commit } from './scripts/commit.mjs';

// `pnpm dev:demo` (vite --mode demo) runs the demo: [env.demo] in wrangler.toml, with local
// settings from .dev.vars.demo instead of .dev.vars.
// The app's language (#124): APP_LANGUAGE=en when building, in the environment or a .env file
// (loadEnv reads both).
// One language per deployment, so the texts of the other one aren't shipped. Not LANGUAGE:
// Linux sets that one for its own locale ("en_US:en").
function language(mode: string): 'de' | 'en' {
	const value = (loadEnv(mode, '.', 'APP_').APP_LANGUAGE ?? 'de').trim().toLowerCase();
	if (value !== 'de' && value !== 'en') throw new Error(`APP_LANGUAGE must be "de" or "en", not "${value}".`);
	return value;
}

export default defineConfig(({ mode }) => ({
	plugins: [
		sveltekit({
			adapter: adapter({ platformProxy: { environment: mode === 'demo' ? 'demo' : undefined } }),
			// An open app notices a deploy within a few minutes and offers "Neu laden" (#140).
			version: { pollInterval: 5 * 60 * 1000 }
		})
	],
	// Shown next to the source link and on /status.
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		__APP_COMMIT__: JSON.stringify(commit()),
		__LANGUAGE__: JSON.stringify(language(mode))
	},
	// Loaded only on demand (#249), so the dev server would find it on first use and reload the
	// page under the person (or test) using it.
	optimizeDeps: { include: ['tesseract.js'] },
	test: {
		include: ['src/**/*.test.ts']
	}
}));
