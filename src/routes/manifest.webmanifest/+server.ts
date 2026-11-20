import { LANGUAGE } from '#lib/i18n/index.ts';
import * as t from '#lib/i18n/texts.ts';
import { orchestra } from '#lib/server/env.ts';
import type { RequestHandler } from './$types';

/**
 * The web app manifest (#62): lets members add the app to their home screen, where it opens
 * without the browser's bars. Built per deployment, for the orchestra's own name.
 */
export const GET: RequestHandler = () => {
	const { name, shortName, logo, colours } = orchestra();
	const manifest = {
		name: `${name} · ${t.nav.appName}`,
		short_name: shortName,
		description: t.pwa.description,
		lang: LANGUAGE,
		start_url: '/',
		scope: '/',
		display: 'standalone',
		background_color: '#f4f4f1',
		theme_color: colours.brand,
		icons: [
			logo.endsWith('.svg')
				? { src: logo, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
				: { src: logo, sizes: '256x256', type: 'image/png', purpose: 'any' }
		],
		shortcuts: [
			{ name: t.nav.myParts, url: '/meine-noten' },
			{ name: t.nav.concerts, url: '/kalender' }
		]
	};
	return new Response(JSON.stringify(manifest), {
		headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' }
	});
};
