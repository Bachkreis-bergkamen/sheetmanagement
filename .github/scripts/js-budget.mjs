#!/usr/bin/env node
/**
 * JavaScript budget per route (#187): after `pnpm build`, adds up the JS a first visit to each page
 * loads (gzip) and fails when a route grows past its budget in .github/js-budget.json.
 *
 *   node .github/scripts/js-budget.mjs           check, print a table, exit 1 when over
 *   node .github/scripts/js-budget.mjs --update  write the budgets from this build
 *
 * A route's JS is what SvelteKit preloads for it: the client entry (start and app), its layouts and
 * its page, each with the chunks they import statically. Error pages and anything loaded with
 * `import()` (pdf.js, pdf-lib, tesseract) don't count, since they arrive only when used. A chunk
 * shared by several nodes counts once per route.
 *
 * The budget is the size at --update plus HEADROOM, rounded up to a whole STEP, so small changes pass
 * and a new library on a page doesn't. A route without its own budget uses "default". When a change
 * is meant to grow a page, run --update and commit the new file with it, so the review sees it.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const OUT = '.svelte-kit/output';
const BUDGETS = '.github/js-budget.json';
const HEADROOM = 1.05;
const STEP = 5; // KB

const kb = (bytes) => bytes / 1024;
const fmt = (bytes) => kb(bytes).toFixed(1);

/** The routes with a page, as { id, nodes } where nodes are the layouts and the leaf. */
function routes(manifest) {
	const found = [];
	const re =
		/id: "([^"]+)",[\s\S]*?page: (null|\{ layouts: \[([^\]]*)\], errors: \[[^\]]*\], leaf: (\d+) \})/g;
	for (const m of manifest.matchAll(re)) {
		if (m[2] === 'null') continue;
		const layouts = m[3]
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.map(Number);
		found.push({ id: m[1], nodes: [...layouts, Number(m[4])] });
	}
	return found;
}

/** The files a list like `imports: ["_app/…", …]` names. */
function list(source, name) {
	const m = source.match(new RegExp(`${name}:? ?=? ?\\[([^\\]]*)\\]`));
	if (!m) throw new Error(`No ${name} list found`);
	return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const gzipped = new Map();
function size(file) {
	let s = gzipped.get(file);
	if (s === undefined) {
		s = gzipSync(readFileSync(join(OUT, 'client', file)), { level: 9 }).length;
		gzipped.set(file, s);
	}
	return s;
}

function measure() {
	const manifestPath = join(OUT, 'server', 'manifest.js');
	if (!existsSync(manifestPath)) throw new Error('No build found: run `pnpm build` first.');
	const manifest = readFileSync(manifestPath, 'utf8');
	const entry = list(manifest.match(/client: \{[^}]*\}/)[0], 'imports');
	const nodeImports = new Map();
	const importsOf = (n) => {
		if (!nodeImports.has(n)) {
			const src = readFileSync(join(OUT, 'server', 'nodes', `${n}.js`), 'utf8');
			nodeImports.set(n, list(src, 'export const imports'));
		}
		return nodeImports.get(n);
	};
	return routes(manifest)
		.map(({ id, nodes }) => {
			const files = new Set(
				[...entry, ...nodes.flatMap(importsOf)].filter((f) => f.endsWith('.js'))
			);
			return { id, bytes: [...files].reduce((sum, f) => sum + size(f), 0) };
		})
		.sort((a, b) => b.bytes - a.bytes);
}

const budgetFor = (bytes) => Math.ceil((kb(bytes) * HEADROOM) / STEP) * STEP;

const measured = measure();

if (process.argv.includes('--update')) {
	const routesBudget = Object.fromEntries(
		[...measured].sort((a, b) => a.id.localeCompare(b.id)).map((r) => [r.id, budgetFor(r.bytes)])
	);
	const largest = Math.max(...Object.values(routesBudget));
	const file = {
		$comment:
			'JS per route on a first visit, KB gzip. Written by `pnpm budget --update` after `pnpm build`; checked in CI.',
		default: largest,
		routes: routesBudget
	};
	writeFileSync(BUDGETS, JSON.stringify(file, null, '\t') + '\n');
	console.log(`Wrote budgets for ${measured.length} routes to ${BUDGETS}.`);
	process.exit(0);
}

const budgets = JSON.parse(readFileSync(BUDGETS, 'utf8'));
const rows = measured.map((r) => {
	const budget = budgets.routes[r.id] ?? budgets.default;
	return {
		...r,
		budget,
		own: r.id in budgets.routes,
		over: kb(r.bytes) > budget
	};
});
const over = rows.filter((r) => r.over);

const table = [
	'| Route | JS (KB gzip) | Budget | |',
	'|---|---:|---:|---|',
	...rows.map(
		(r) =>
			`| \`${r.id}\` | ${fmt(r.bytes)} | ${r.budget}${r.own ? '' : ' (default)'} | ${r.over ? '❌ over' : ''} |`
	)
].join('\n');

console.log(
	rows
		.map(
			(r) =>
				`${r.over ? 'OVER ' : '     '}${fmt(r.bytes).padStart(7)} / ${String(r.budget).padStart(4)} KB  ${r.id}`
		)
		.join('\n')
);

if (process.env.GITHUB_STEP_SUMMARY) {
	const head = over.length
		? `### JS budget: ${over.length} route${over.length > 1 ? 's' : ''} over`
		: '### JS budget: every route within its budget';
	const body = over.length
		? `${head}\n\nIf the growth is meant, run \`pnpm build && pnpm budget --update\` and commit \`${BUDGETS}\`.\n\n${table}\n`
		: `${head}\n\n<details><summary>All routes</summary>\n\n${table}\n\n</details>\n`;
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, body);
}

if (over.length) {
	console.error(
		`\n${over.length} route(s) over budget: ${over.map((r) => r.id).join(', ')}.\n` +
			`If the growth is meant, run \`pnpm build && pnpm budget --update\` and commit ${BUDGETS}.`
	);
	process.exit(1);
}
console.log(`\nAll ${rows.length} routes within budget.`);
