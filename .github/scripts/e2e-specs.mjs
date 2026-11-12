#!/usr/bin/env node
/**
 * Which end-to-end specs a pull request can affect, from its changed files (one per line on stdin).
 * Prints "all" for the whole suite, nothing when no spec is affected, or the spec files to run.
 *
 *   git diff --name-only --no-renames origin/main...HEAD | node .github/scripts/e2e-specs.mjs
 *
 * The specs don't import the app, so Playwright can't trace a change to them itself. Instead an app
 * file is followed up its importers (`import … from '#lib/…'` and relative imports) to the route
 * pages that use it, and each route maps to the specs that open it (ROUTES below). Anything the
 * walk can't place runs the whole suite: the map only ever saves time, it never decides a spec
 * doesn't matter when unsure. Pushes to main always run the whole suite, for whatever this misses.
 *
 * When a spec starts opening a new page, add the page to ROUTES.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const ALL = 'all';
const PRACTICE = 'e2e/practice.spec.ts';
const PAGES = 'e2e/pages.spec.ts';
const FLOWS = 'e2e/flows.spec.ts';
const TOUR = 'e2e/tour.spec.ts';
const INSTALL = 'e2e/install.spec.ts';

/** Files no test looks at: docs, unit tests, repository housekeeping. */
const IGNORED = [
	/^docs\//,
	/\.md$/,
	/^LICENSE$/,
	/^src\/.*\.test\.ts$/,
	/^\.github\/(ISSUE_TEMPLATE\/|pull_request_template\.md$|dependabot\.yml$)/,
	/^\.github\/workflows\/deploy\.yml$/,
	/^\.github\/scripts\/smoke-test\.sh$/,
	/^\.claude\//,
	/^\.impeccable\//,
	/^graphify-out\//,
	/^\.gitignore$/,
	/^\.gitattributes$/,
	/^\.dev\.vars\.example$/,
	// Production-only: the scheduled worker and the scripts that run outside the app.
	/^src\/worker\//,
	/^scripts\//
];

/** Files every page depends on, or the test setup itself: the whole suite. */
const SHARED = [
	/^src\/routes\/\+layout/,
	/^src\/routes\/\+error/,
	/^src\/routes\/api\//, // the pages fetch these; the demo's reset is one of them
	/^src\/routes\/demo\//,
	/^src\/hooks/,
	/^src\/app\./,
	/^src\/lib\/index\.ts$/,
	/^src\/lib\/i18n\//,
	/^src\/lib\/server\//,
	/^src\/lib\/access\//,
	/^src\/lib\/config\//,
	/^static\//,
	/^package\.json$/,
	/^pnpm-lock\.yaml$/,
	/^playwright\.config\.ts$/,
	/^vite\.config\./,
	/^svelte\.config\./,
	/^tsconfig\.json$/,
	/^wrangler\.toml$/, // the demo's bindings come from [env.demo]
	/^migrations\//, // the database schema, which the app reads too
	/^e2e\/(?!.*\.spec\.ts$)/, // demo.ts, ports.ts: every spec uses them
	/^\.github\/workflows\/ci\.yml$/,
	/^\.github\/scripts\/e2e-specs\.mjs$/
];

/**
 * Route folders (under src/routes) and the specs that open them. The longest matching prefix wins;
 * a route not listed here runs PAGES and FLOWS, which between them open most pages.
 */
const ROUTES = {
	'': [PAGES, FLOWS, TOUR, INSTALL], // the start page: greeting, the tour's first card, the install hint
	ueben: [PRACTICE],
	'meine-noten': [PRACTICE, PAGES, FLOWS, TOUR],
	install: [INSTALL, PAGES],
	profil: [PAGES, FLOWS, TOUR, INSTALL],
	kalender: [PAGES, FLOWS, TOUR],
	stuecke: [PAGES, FLOWS, TOUR],
	'manifest.webmanifest': [INSTALL],
	'pdfjs-wasm': [PRACTICE, PAGES, FLOWS] // the score viewer's PDF engine
};
const OTHER_ROUTE = [PAGES, FLOWS];

/** The service worker is blocked in the tests; installing is the only spec near it. */
const SERVICE_WORKER = /^src\/service-worker\//;

const changed = readFileSync(0, 'utf8')
	.split('\n')
	.map((line) => line.trim().replaceAll('\\', '/'))
	.filter(Boolean);

console.log(specsFor(changed));

function specsFor(files) {
	const specs = new Set();
	let importers;
	for (const file of files) {
		if (IGNORED.some((pattern) => pattern.test(file))) continue;
		if (SHARED.some((pattern) => pattern.test(file))) return ALL;
		if (/^e2e\/[^/]+\.spec\.ts$/.test(file)) {
			if (statSync(file, { throwIfNoEntry: false })) specs.add(file); // not one the PR deletes
			continue;
		}
		if (SERVICE_WORKER.test(file)) {
			specs.add(INSTALL);
			continue;
		}
		if (!file.startsWith('src/')) return ALL; // a file the map doesn't know

		// The routes this file ends up in, through everything that imports it.
		importers ??= importGraph();
		const routes = routesUsing(file, importers);
		if (routes === ALL) return ALL;
		for (const route of routes) for (const spec of specsForRoute(route)) specs.add(spec);
	}
	return [...specs].sort().join(' ');
}

/** The route files reached from a file by following its importers; ALL when it reaches none. */
function routesUsing(file, importers) {
	const seen = new Set([file]);
	const queue = [file];
	const routes = new Set();
	while (queue.length) {
		const current = queue.shift();
		if (SHARED.some((pattern) => pattern.test(current))) return ALL; // used by the layout, i18n, …
		if (current.startsWith('src/routes/')) routes.add(current);
		for (const importer of importers.get(current) ?? []) {
			if (seen.has(importer)) continue;
			seen.add(importer);
			queue.push(importer);
		}
	}
	// A deleted file, or one only reached in a way this can't follow: don't guess.
	return routes.size ? routes : ALL;
}

function specsForRoute(file) {
	const folder = dirname(file.slice('src/routes/'.length)).replace(/^\.$/, '');
	// Group folders like (app) don't show in the URL.
	const path = folder
		.split('/')
		.filter((part) => !/^\(.*\)$/.test(part))
		.join('/');
	const match = Object.keys(ROUTES)
		.filter((route) => route === '' ? path === '' : path === route || path.startsWith(`${route}/`))
		.sort((a, b) => b.length - a.length)[0];
	return match === undefined ? OTHER_ROUTE : ROUTES[match];
}

/** Every file under src, mapped to the files that import it. */
function importGraph() {
	const importers = new Map();
	for (const file of walk('src')) {
		if (!/\.(ts|js|svelte)$/.test(file)) continue;
		// Type-only imports are gone at runtime (`pnpm check` covers them), so they don't count.
		const source = readFileSync(file, 'utf8').replace(/\b(?:import|export)\s+type\s[^;]*?\bfrom\s*['"][^'"]+['"]/g, '');
		// `import … from '…'`, `export … from '…'`, `import '…'` and `import('…')`.
		for (const [, specifier] of source.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g)) {
			const target = resolve(file, specifier);
			if (!target) continue;
			if (!importers.has(target)) importers.set(target, new Set());
			importers.get(target).add(file);
		}
	}
	return importers;
}

function resolve(from, specifier) {
	const bare = specifier.split('?')[0];
	let path;
	if (bare === '#lib') path = 'src/lib/index.ts';
	else if (bare.startsWith('#lib/')) path = `src/lib/${bare.slice(5)}`;
	else if (bare.startsWith('.')) path = normalize(join(dirname(from), bare)).replaceAll('\\', '/');
	else return null; // a package
	// The app writes extensions out; these cover the odd import that doesn't.
	for (const candidate of [path, `${path}.ts`, `${path}.js`, `${path}/index.ts`]) {
		if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate;
	}
	return path;
}

function* walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = `${dir}/${entry.name}`;
		if (entry.isDirectory()) yield* walk(path);
		else yield path;
	}
}
