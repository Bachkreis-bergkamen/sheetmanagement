#!/usr/bin/env node
/**
 * Which end-to-end specs a pull request can affect, from its changed files (one per line on stdin).
 * Prints "all" for the whole suite, nothing when no spec is affected, or the spec files to run.
 *
 *   git diff --name-only --no-renames origin/main...HEAD | E2E_BASE=origin/main node .github/scripts/e2e-specs.mjs
 *
 * The specs don't import the app, so Playwright can't trace a change to them itself. Instead an app
 * file is followed up its importers (`import … from '#lib/…'` and relative imports) to the route
 * pages that use it, and each route maps to the specs that open it (ROUTES below). Two links that
 * aren't imports are followed too: an API route to the files that fetch its URL, and a change to
 * the texts (de.ts, en.ts) to the files that use the sections it touches (`t.practice…`).
 *
 * Anything the walk can't place runs the whole suite: the map only ever saves time, it never decides
 * a spec doesn't matter when unsure. Pushes to main always run the whole suite, for what this misses.
 * When a spec starts opening a new page, add the page to ROUTES.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const ALL = 'all';
const PRACTICE = 'e2e/practice.spec.ts';
const PAGES = 'e2e/pages.spec.ts';
const FLOWS = 'e2e/flows.spec.ts';
const TOUR = 'e2e/tour.spec.ts';
const INSTALL = 'e2e/install.spec.ts';

/** Files no spec looks at: docs, unit tests, housekeeping, and what only production runs. */
const IGNORED = [
	/^docs\//,
	/\.md$/,
	/^LICENSE$/,
	/\.test\.ts$/,
	/^\.github\/(ISSUE_TEMPLATE\/|pull_request_template\.md$|dependabot\.yml$)/,
	/^\.github\/workflows\/(deploy|uptime|wiki)\.yml$/,
	/^\.github\/scripts\/smoke-test\.sh$/,
	/^\.claude\//,
	/^\.impeccable\//,
	/^graphify-out\//,
	/^\.gitignore$/,
	/^\.gitattributes$/,
	/^\.dev\.vars\.example$/,
	// The scheduled worker, the build's worker wrapper and other scripts, and the D1 schema: the demo
	// runs neither, and keeps its data in memory.
	/^src\/worker\//,
	/^scripts\//,
	/^migrations\//
];

/**
 * Files every page depends on, and the test setup itself: changing one, or reaching one while
 * following importers, runs the whole suite.
 */
const SHARED = [
	/^src\/routes\/\+layout/,
	/^src\/routes\/\+error/,
	/^src\/routes\/demo\//, // the demo's sign-in and reset, which every spec starts with
	/^src\/routes\/api\/health\//, // Playwright waits for it
	/^src\/hooks/,
	/^src\/app\./,
	/^src\/lib\/i18n\/(index|types)\.ts$/,
	/^static\//,
	/^package\.json$/,
	/^pnpm-lock\.yaml$/,
	/^playwright\.config\.ts$/,
	/^vite\.config\./,
	/^svelte\.config\./,
	/^tsconfig\.json$/,
	/^wrangler\.toml$/, // the demo's bindings come from [env.demo]
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

/** The texts, one object per language with a section per area (`nav`, `practice`, …). */
const TEXTS = /^src\/lib\/i18n\/(de|en)\.ts$/;
const LEGAL_TEXTS = /^src\/lib\/i18n\/legal\.(de|en)\.ts$/;

const changed = readFileSync(0, 'utf8')
	.split('\n')
	.map((line) => line.trim().replaceAll('\\', '/'))
	.filter(Boolean);

let sources;
let importers;
console.log(specsFor(changed));

function specsFor(files) {
	const specs = new Set();
	for (const file of files) {
		if (IGNORED.some((pattern) => pattern.test(file))) continue;
		if (SHARED.some((pattern) => pattern.test(file))) return all(file, 'shared');
		if (/^e2e\/[^/]+\.spec\.ts$/.test(file)) {
			if (statSync(file, { throwIfNoEntry: false })) specs.add(file); // not one the PR deletes
			continue;
		}
		if (SERVICE_WORKER.test(file)) {
			specs.add(INSTALL);
			continue;
		}
		if (!file.startsWith('src/')) return all(file, 'not in the map');

		// The texts aren't followed through their importers (every page has them), but through the
		// files that use the sections the change touches.
		let starts = [file];
		if (TEXTS.test(file) || LEGAL_TEXTS.test(file)) {
			const sections = LEGAL_TEXTS.test(file) ? ['legal'] : changedSections(file);
			if (sections === ALL) return all(file, 'a change outside the text sections');
			starts = sections.flatMap(usersOfSection);
			if (sections.length && !starts.length) return all(file, `no file reads t.${sections.join(', t.')}`);
		}

		// The routes these files end up in, through everything that imports them.
		for (const start of starts) {
			const routes = routesUsing(start);
			if (typeof routes === 'string') return all(file, routes);
			for (const route of routes) for (const spec of specsForRoute(route)) specs.add(spec);
		}
	}
	return [...specs].sort().join(' ');
}

/** The route pages reached from a file by following its importers, or why it can't be placed. */
function routesUsing(file) {
	importers ??= importGraph();
	const seen = new Set([file]);
	const queue = [file];
	const routes = new Set();
	while (queue.length) {
		const current = queue.shift();
		if (SHARED.some((pattern) => pattern.test(current))) return `used by ${current}`; // the layout, hooks, …
		let next = importers.get(current) ?? [];
		const api = current.match(/^src\/routes\/api\/([^/]+)\//);
		if (api) {
			// No page is an API route; what counts are the pages whose code calls it.
			next = [...next, ...callersOf(api[1])];
			if (!next.length) return `nothing calls /api/${api[1]}`;
		} else if (current.startsWith('src/routes/')) routes.add(current);
		for (const importer of next) {
			if (seen.has(importer)) continue;
			seen.add(importer);
			queue.push(importer);
		}
	}
	// A deleted file, or one only reached in a way this can't follow: don't guess.
	return routes.size ? routes : 'reaches no page';
}

/** The whole suite, saying why on stderr (the CI log shows it). */
function all(file, reason) {
	console.error(`Whole suite: ${file} (${reason})`);
	return ALL;
}

function specsForRoute(file) {
	const folder = dirname(file.slice('src/routes/'.length)).replace(/^\.$/, '');
	// Group folders like (app) don't show in the URL.
	const path = folder
		.split('/')
		.filter((part) => !/^\(.*\)$/.test(part))
		.join('/');
	const match = Object.keys(ROUTES)
		.filter((route) => (route === '' ? path === '' : path === route || path.startsWith(`${route}/`)))
		.sort((a, b) => b.length - a.length)[0];
	return match === undefined ? OTHER_ROUTE : ROUTES[match];
}

/**
 * The top-level sections of a texts file (`\tpractice: {`) that the pull request's lines touch, read
 * from its diff against E2E_BASE. ALL without a base, or for a line outside any section.
 */
function changedSections(file) {
	const base = process.env.E2E_BASE;
	if (!base) return ALL;
	let diff;
	try {
		diff = execFileSync('git', ['diff', '-U0', '--no-renames', `${base}...HEAD`, '--', file], { encoding: 'utf8' });
	} catch {
		return ALL;
	}
	if (!statSync(file, { throwIfNoEntry: false })) return ALL;
	const lines = readFileSync(file, 'utf8').split('\n');
	const sections = new Set();
	for (const [, start, count] of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
		const first = Number(start);
		const length = count === undefined ? 1 : Number(count);
		// A pure deletion sits after line `first`; look at the lines on both sides of it.
		const touched = length ? Array.from({ length }, (_, i) => first + i) : [first, first + 1];
		for (const number of touched) {
			const section = sectionAt(lines, number - 1);
			if (!section) return ALL;
			sections.add(section);
		}
	}
	return [...sections];
}

/** The section a line belongs to: the nearest line above (or itself) indented by exactly one tab. */
function sectionAt(lines, index) {
	for (let i = Math.min(index, lines.length - 1); i >= 0; i--) {
		const line = lines[i];
		const top = line.match(/^\t([A-Za-z_$][\w$]*)\s*[:,(]/);
		if (top) return top[1];
		// Back at the top of the file, or inside a template string that starts at the margin.
		if (/^\S/.test(line)) return null;
	}
	return null;
}

/** The files outside the texts that read a section, as `t.practice`. */
function usersOfSection(section) {
	const pattern = new RegExp(`\\bt\\.${section.replace(/\$/g, '\\$')}\\b`);
	return [...appSources()].filter(([file, source]) => !file.startsWith('src/lib/i18n/') && pattern.test(source)).map(([file]) => file);
}

/** The files that call an API route by its URL (`/api/ueben/…`). */
function callersOf(segment) {
	const pattern = new RegExp(`/api/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
	return [...appSources()].filter(([file, source]) => !file.startsWith('src/routes/api/') && pattern.test(source)).map(([file]) => file);
}

/** Every file under src, mapped to the files that import it. */
function importGraph() {
	const graph = new Map();
	for (const [file, text] of appSources()) {
		// Type-only imports are gone at runtime (`pnpm check` covers them), so they don't count.
		const source = text.replace(/\b(?:import|export)\s+type\s[^;]*?\bfrom\s*['"][^'"]+['"]/g, '');
		// `import … from '…'`, `export … from '…'`, `import '…'` and `import('…')`.
		for (const [, specifier] of source.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g)) {
			const target = resolve(file, specifier);
			if (!target) continue;
			if (!graph.has(target)) graph.set(target, new Set());
			graph.get(target).add(file);
		}
	}
	return graph;
}

/** The app's code: every .ts, .js and .svelte file under src but the unit tests, by path. */
function appSources() {
	sources ??= new Map(
		[...walk('src')].filter((file) => /\.(ts|js|svelte)$/.test(file) && !/\.test\.ts$/.test(file)).map((file) => [file, readFileSync(file, 'utf8')])
	);
	return sources;
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
