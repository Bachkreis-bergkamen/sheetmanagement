import { error } from '@sveltejs/kit';
import { env, waitUntil } from 'cloudflare:workers';
import { brandColours, brandStyle, DEFAULT_LOGO, lookStyle, parseColour } from '#lib/branding.ts';
import { config } from '#lib/config/index.ts';
import { ALL_ON, OPT_IN, resolveFeatures, type Feature, type Features } from '#lib/features.ts';
import { parseLinks } from '#lib/links.ts';
import { validLogo, type StoredSettings } from '#lib/settings.ts';
import type { KvStore } from './cache.ts';
import { t } from '#lib/i18n/index.ts';
import type { LockNamespace } from './sheet-lock.ts';
import type { D1 } from './db/sql.ts';

/**
 * Deployment settings. Set them with `wrangler secret put <NAME>` in production
 * and in `.dev.vars` locally; see `.dev.vars.example`.
 */
export interface AppEnv {
	ORCHESTRA_NAME?: string;
	ORCHESTRA_SHORT_NAME?: string;
	/** The orchestra's square logo: a path in the app ("/demo/musterorchester.svg") or an https link. Default: /logo.png. */
	ORCHESTRA_LOGO?: string;
	/** Accent colour as #rrggbb, e.g. "#1d4ed8"; the shades for light and dark are derived from it (#75). Default: the preset's. */
	ORCHESTRA_ACCENT?: string;
	/** Website and social media for the footer, "Name https://…" separated by ";" or new lines. Default: none. */
	ORCHESTRA_LINKS?: string;
	/** Parts of the app this orchestra doesn't use, comma-separated: "leihmaterial, gema, anwesenheit" (#134); see src/lib/features.ts. */
	FEATURES_OFF?: string;
	/** Parts that are off unless turned on here, comma-separated: "karten" sells concert tickets (docs/tickets-plan.md). */
	FEATURES_ON?: string;
	/** The app's own address, e.g. "https://noten.example.org". Requests to the workers.dev address are redirected there. Optional. */
	APP_URL?: string;
	GOOGLE_SERVICE_ACCOUNT_JSON?: string;
	CALENDAR_ID?: string;
	DRIVE_ARCHIVE_FOLDER_ID?: string;
	DRIVE_CURRENT_PROGRAM_FOLDER_ID?: string;
	/** A Drive folder only admins can open, for the weekly backup of the database (#186). Optional. */
	DRIVE_BACKUP_FOLDER_ID?: string;
	REPERTOIRE_SHEET_ID?: string;
	/** "true" lets the app mirror problem reports into Drive (comments, status words in file names). Needs the service account as editor. */
	DRIVE_WRITE?: string;
	/** "true" lets people with "termine.planen" add concerts and rehearsals to the calendar. Needs the calendar shared with "Make changes to events". */
	CALENDAR_WRITE?: string;
	/** Google sign-in (OAuth client of type "Web application"). Without it (and without FORCE_AUTH=true) the app is open and read-only. */
	GOOGLE_OAUTH_CLIENT_ID?: string;
	GOOGLE_OAUTH_CLIENT_SECRET?: string;
	/** At least 32 random characters; signs the session cookies. */
	SESSION_SECRET?: string;
	/**
	 * "false" turns sign-in off although GOOGLE_OAUTH_CLIENT_ID is set: the app is then open and read-only.
	 * "true" turns it on without Google, with email and password and access links only. Default: on with Google, else off.
	 */
	FORCE_AUTH?: string;
	/** Comma-separated emails that always have every right. */
	BOOTSTRAP_ADMINS?: string;
	/** Who is responsible for the app, for the privacy notice (defaults to ORCHESTRA_NAME). */
	LEGAL_NAME?: string;
	/** Postal address of the responsible person or club, e.g. "Musterstraße 1, 12345 Musterstadt". */
	LEGAL_ADDRESS?: string;
	/** Contact email for privacy questions. */
	LEGAL_EMAIL?: string;
	/** YouTube Data API key: suggests a piece's duration from its Hörbeispiel (#133). Optional. */
	YOUTUBE_API_KEY?: string;
	/** "true": sample data instead of Google, signed in as a demo user; for trying the app (#121). */
	DEMO?: string;
	/** "true": the finished app, without the "Beta" badge every page shows until then. */
	RELEASE?: string;
	/** KV namespace binding from wrangler.toml; optional, memory is used without it. */
	CACHE?: KvStore;
	/** Durable Object binding from wrangler.toml: the queue for writes to the sheet (#156). Optional. */
	SHEET_LOCK?: LockNamespace;
	/** D1 binding from wrangler.toml: data the app writes itself (#161). Optional, memory is used without it. */
	DB?: D1;
	/** Web Push keys (#157), made with `node scripts/vapid-keys.mjs`. Without them there are no notifications. */
	VAPID_PUBLIC_KEY?: string;
	VAPID_PRIVATE_KEY?: string;
}

export function appEnv(): AppEnv {
	return env as unknown as AppEnv;
}

/** The logo for header, calendar and app icon; ORCHESTRA_LOGO if it is a path or a web link. */
function orchestraLogo(logo: string | undefined): string {
	return validLogo(logo) ?? DEFAULT_LOGO;
}

/**
 * What /einstellungen saved in the sheet, as last read. The same for every request of this
 * deployment, so one copy per Worker instance does; the hook refreshes it from the cache.
 */
let stored: StoredSettings = {};

export function useStoredSettings(settings: StoredSettings) {
	stored = settings;
}

/** Each setting's value without the page: the variable, else the preset. /einstellungen shows these. */
export function defaultSettings() {
	const env = appEnv();
	const name = env.ORCHESTRA_NAME?.trim();
	return {
		name: name || config.name,
		shortName: env.ORCHESTRA_SHORT_NAME?.trim() || name || config.shortName,
		logo: orchestraLogo(env.ORCHESTRA_LOGO),
		accent: parseColour(env.ORCHESTRA_ACCENT) ?? parseColour(config.accent) ?? '#e6b422',
		/** The preset's own light shade, used with the default colour. */
		accentLight: parseColour(env.ORCHESTRA_ACCENT) ? undefined : config.accentLight,
		look: config.look ?? 'bold',
		links: parseLinks(env.ORCHESTRA_LINKS),
		features: resolveFeatures(config.features, env.FEATURES_OFF, env.FEATURES_ON).features
	};
}

/** Name, short name, logo, links, colours and look of this deployment: /einstellungen, else the variables, else the preset. */
export function orchestra() {
	const env = appEnv();
	const name = stored.name ?? env.ORCHESTRA_NAME?.trim();
	const accent = stored.accent ?? parseColour(env.ORCHESTRA_ACCENT);
	const colours = brandColours(accent ?? parseColour(config.accent) ?? '#e6b422');
	const look = stored.look ?? config.look ?? 'bold';
	return {
		name: name || config.name,
		// A custom name without a custom short name shouldn't fall back to the preset's short name.
		shortName: stored.shortName ?? (env.ORCHESTRA_SHORT_NAME?.trim() || name || config.shortName),
		logo: stored.logo ?? orchestraLogo(env.ORCHESTRA_LOGO),
		colours,
		/** The theme's custom properties for a <style> on :root; the preset's light shade unless the variable sets a colour. */
		style: brandStyle(colours, accent ? undefined : config.accentLight) + lookStyle(look),
		look,
		/** Website and social media for the footer; none unless the orchestra set them. */
		links: stored.links ?? parseLinks(env.ORCHESTRA_LINKS),
		/** The light shade is the preset's own (`accentLight`), not the derived one. */
		presetLight: !accent && !!config.accentLight,
		/** ORCHESTRA_ACCENT was set but isn't a colour; /status says so. */
		badAccent: !!env.ORCHESTRA_ACCENT?.trim() && !parseColour(env.ORCHESTRA_ACCENT)
	};
}

/** Which parts of the app are on for this deployment (#134): as saved on /einstellungen, else FEATURES_OFF and the preset. */
export function features(): Features {
	const deployment = resolveFeatures(config.features, appEnv().FEATURES_OFF, appEnv().FEATURES_ON).features;
	if (!stored.featuresOff) return deployment;
	// The page can turn an opt-in feature off, but only the deployment turns it on.
	const optIn = Object.fromEntries(OPT_IN.map((feature) => [feature, deployment[feature]]));
	return { ...ALL_ON, ...optIn, ...Object.fromEntries(stored.featuresOff.map((feature) => [feature, false])) };
}

/** Whether /einstellungen offers the feature: an opt-in one only once the deployment turned it on. */
export function offeredFeature(feature: Feature): boolean {
	return !OPT_IN.includes(feature) || resolveFeatures(config.features, appEnv().FEATURES_OFF, appEnv().FEATURES_ON).features[feature];
}

/** Words in FEATURES_OFF that name no feature, for /status. */
export function unknownFeatures(): string[] {
	return resolveFeatures(config.features, appEnv().FEATURES_OFF, appEnv().FEATURES_ON).unknown;
}

export const isOn = (feature: Feature) => features()[feature];

/** For the pages of a feature: they don't exist while it's off. */
export function requireFeature(feature: Feature) {
	if (!isOn(feature)) error(404, t.error.notFound);
}

/** Demo mode: invented sample data in memory instead of Google, no real accounts. */
export function isDemo(): boolean {
	return ['true', '1', 'yes', 'on'].includes((appEnv().DEMO ?? '').trim().toLowerCase());
}

/** The release: hides the "Beta" badge. The demo never shows it either. */
export function isRelease(): boolean {
	return ['true', '1', 'yes', 'on'].includes((appEnv().RELEASE ?? '').trim().toLowerCase());
}

/** Lets work continue after the response is sent (e.g. a cache refresh). */
export function runInBackground(promise: Promise<unknown>) {
	waitUntil(promise);
}
