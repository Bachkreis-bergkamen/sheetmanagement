// Runs after `vite build` (#156, #160). The SvelteKit adapter writes a worker that only exports
// `fetch`; the deployed worker also has to export the Durable Object classes and the Cron
// Trigger's `scheduled` handler from src/worker/.
//
// Since adapter-cloudflare 9 the worker is .svelte-kit/cloudflare/worker/index.js, next to the
// wrangler.json the adapter generates for `wrangler deploy`. That config uploads the files as
// they are (no_bundle), so the TypeScript in src/worker/ is built here, with Vite, into one
// entry: the adapter's worker moves to kit.js, and index.js re-exports it with the classes.
// The job tokens live on globalThis (src/lib/server/jobs/token.ts), so the entry and the app
// share them although they are built apart.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const dir = '.svelte-kit/cloudflare/worker';
const main = `${dir}/index.js`;
const kit = `${dir}/kit.js`;
const entry = `${dir}/_entry.js`;

const built = fs.readFileSync(main, 'utf8');
if (built.includes('wrap-worker')) throw new Error(`${main} is already wrapped; run vite build first.`);
fs.renameSync(main, kit);
// Source maps name the file they belong to.
if (fs.existsSync(`${main}.map`)) fs.renameSync(`${main}.map`, `${kit}.map`);

const src = (file) => path.relative(dir, path.resolve('src/worker', file)).replaceAll('\\', '/');
fs.writeFileSync(
	entry,
	`// Written by scripts/wrap-worker.mjs: SvelteKit's worker plus the Durable Objects and the Cron Trigger.
import kit from './kit.js';
import { scheduled } from '${src('scheduled.ts')}';
export { SheetWriteLock } from '${src('sheet-write-lock.ts')}';

export default {
	...kit,
	scheduled: (controller, env, ctx) => ctx.waitUntil(scheduled(kit, env, ctx))
};
`
);

try {
	await build({
		configFile: false,
		logLevel: 'warn',
		publicDir: false,
		resolve: { conditions: ['workerd', 'worker', 'module', 'import'] },
		build: {
			ssr: entry,
			outDir: dir,
			emptyOutDir: false,
			copyPublicDir: false,
			minify: false,
			target: 'esnext',
			rolldownOptions: {
				// The adapter's worker stays its own file; the runtime provides cloudflare:workers.
				external: ['./kit.js', 'cloudflare:workers'],
				output: { entryFileNames: 'index.js', format: 'es' }
			}
		},
		ssr: { noExternal: true }
	});
} finally {
	fs.rmSync(entry);
}

const wrapped = fs.readFileSync(main, 'utf8');
if (!wrapped.includes('SheetWriteLock') || !wrapped.includes('./kit.js')) throw new Error(`${main} doesn't export the worker with SheetWriteLock.`);
console.log(`Wrapped ${main}: SheetWriteLock and scheduled added.`);
