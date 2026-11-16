// A small lint step (#359), next to the type check: only what types don't catch.
// - A promise neither awaited nor handed on (.ts files): on Workers it's cancelled with the
//   response, unless it goes to waitUntil. `void promise` says "on purpose, it may finish or not".
//   Not in .svelte files: in the browser, starting goto() or a fetch without waiting is normal.
// - Unused imports and variables, everywhere. A leading underscore marks one unused on purpose.
// No formatting or style rules: the code is written by hand in the house style.
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';

const unused = ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }];

export default ts.config(
	{ ignores: ['.svelte-kit/', '.wrangler/', 'build/', 'node_modules/', 'playwright-report/', 'test-results/', 'static/', 'src/service-worker/', '**/*.js', '**/*.mjs'] },
	{ linterOptions: { reportUnusedDisableDirectives: 'error' } },
	...svelte.configs.base,
	// After the Svelte block, so .svelte.ts files (runes) are read as TypeScript too.
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: ts.parser,
			parserOptions: { projectService: { allowDefaultProject: ['playwright.config.ts'] }, tsconfigRootDir: import.meta.dirname }
		},
		plugins: { '@typescript-eslint': ts.plugin },
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-unused-vars': unused
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: { parserOptions: { parser: ts.parser } },
		plugins: { '@typescript-eslint': ts.plugin },
		rules: { '@typescript-eslint/no-unused-vars': unused }
	}
);
