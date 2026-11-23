import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv, type Plugin } from 'vite';
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

// The texts are one module per area, imported through src/lib/i18n/texts.ts (#356). That file
// re-exports the German ones; an English build points its one import at the English ones, so
// each page still gets only the areas it reads, in one language.
function textsLanguage(lang: 'de' | 'en'): Plugin {
	return {
		name: 'texts-language',
		enforce: 'pre',
		resolveId(source, importer, options) {
			if (lang === 'de' || source !== './de/index.ts' || !importer) return null;
			if (!/[\\/]lib[\\/]i18n[\\/]texts\.ts$/.test(importer)) return null;
			return this.resolve('./en/index.ts', importer, { ...options, skipSelf: true });
		}
	};
}

export default defineConfig(({ mode }) => {
	// The Wrangler environment (adapter-cloudflare 9 reads it through Cloudflare's Vite plugin):
	// [env.demo] for `pnpm dev:demo`. A build for the demo sets CLOUDFLARE_ENV=demo itself, so the
	// generated wrangler.json is the demo Worker's.
	if (mode === 'demo') process.env.CLOUDFLARE_ENV ??= 'demo';
	return config(mode);
});

const config = (mode: string) => ({
	plugins: [
		textsLanguage(language(mode)),
		sveltekit({
			adapter: adapter({ platformProxy: { environment: process.env.CLOUDFLARE_ENV || undefined } }),
			// An open app notices a deploy within a few minutes and offers "Neu laden" (#140).
			version: { pollInterval: 5 * 60 * 1000 },
			// Which scripts may run (#358): the app's own, SvelteKit's inline ones by nonce, and
			// WebAssembly (pdf.js's decoders, ZXing at the door, Tesseract). Tesseract's engine comes
			// from jsDelivr into a blob: worker. Enforced since the report-only run stayed quiet; what
			// it still blocks is reported to /api/csp and shows in the error log on /status.
			// The one inline handler allowed is Svelte's own `onerror="this.__e=event"` (and onload) on
			// images, which keeps an error from before hydration for the component; the hash is of
			// exactly that text, so no other inline handler runs.
			// Styles aren't limited: the brand colours and Svelte's transitions are inline styles.
			// frame-ancestors stays in hooks.server.ts, which every response gets.
			csp: {
				mode: 'auto',
				directives: {
					'script-src': [
						'self',
						'wasm-unsafe-eval',
						'https://cdn.jsdelivr.net',
						'unsafe-hashes',
						'sha256-7dQwUgLau1NFCCGjfn9FsYptB6ZtWxJin6VohGIu20I='
					],
					'worker-src': ['self', 'blob:'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'report-uri': ['/api/csp']
				}
			}
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
});
