// All user-facing texts, one module per area of the app (#356). Import them as a namespace,
// `import * as t from '#lib/i18n/texts.ts'`, and read them as `t.area.key`: the bundler then
// ships each page only the areas it reads, not every text of the app.
// The German modules are the reference. An English build (APP_LANGUAGE=en) gets the English
// ones in their place: the `texts-language` plugin in vite.config.ts points this import there.
export * from './de/index.ts';
