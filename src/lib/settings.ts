import { LOOKS, parseColour, type Look } from '#lib/branding.ts';
import { FEATURES, type Feature } from '#lib/features.ts';
import * as t from '#lib/i18n/texts.ts';
import type { InstrumentOverride, OrchestraLink } from '#lib/config/index.ts';
import { linksText, parseLinks } from '#lib/links.ts';
import type { Table } from '#lib/repertoire/sheet.ts';

/**
 * What an admin sets on /einstellungen: name, logo, colour, look, the orchestra's links and the parts of the app in use.
 * Kept in the sheet's "Einstellungen" tab, one row per setting, so a deployment changes them
 * without a variable or a code change. They win over the variables, which win over the preset.
 */

/** The words in the "Einstellung" column, in the deployment's language like the sheet's other names. */
export const SETTING_KEYS = t.sheet.settings.keys;

/** The look's word in the value column, in the deployment's language like the keys. */
export const LOOK_WORDS: Record<Look, string> = t.sheet.settings.lookValues;

const lookOf = (word: string) => LOOKS.find((look) => look === word.toLowerCase() || LOOK_WORDS[look] === word.toLowerCase());

export type SettingKey = keyof typeof SETTING_KEYS;

export interface StoredSettings {
	name?: string;
	shortName?: string;
	logo?: string;
	/** #rrggbb */
	accent?: string;
	look?: Look;
	/** Set once the page saved the features, even when nothing is off. */
	featuresOff?: Feature[];
	/** Sign-ups and attendance keep names for this many seasons (#158); unset keeps them. */
	retention?: number;
	/** Website and social media in the footer; unset falls back to ORCHESTRA_LINKS. */
	links?: OrchestraLink[];
}

const MAX_NAME = 80;
const MAX_SHORT_NAME = 24;
const MAX_SEASONS = 20;
const MAX_LINKS = 8;

/** "3" → 3; anything but a whole number from 1 to 20 is no retention. */
const seasonsOf = (text: string) => (/^\d{1,2}$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= MAX_SEASONS ? Number(text) : undefined);

const keyOf = (word: string) =>
	(Object.entries(SETTING_KEYS) as [SettingKey, string][]).find(([, name]) => name.toLowerCase() === word.trim().toLowerCase())?.[0];

/** A logo is a path in the app ("/mein-logo.svg") or an https link; anything else could break the page. */
export function validLogo(text: string | undefined): string | undefined {
	const logo = text?.trim();
	return logo && (/^\/(?!\/)[\w./-]+$/.test(logo) || /^https:\/\/[^\s"'<>]+$/.test(logo)) ? logo : undefined;
}

/** The settings in the tab; rows with unknown names or unusable values are ignored. */
export function readSettings(rows: { values: { key: string; value: string } }[]): StoredSettings {
	const settings: StoredSettings = {};
	for (const { values } of rows) {
		const key = keyOf(values.key);
		const value = values.value.trim();
		if (key === 'name' && value) settings.name = value.slice(0, MAX_NAME);
		else if (key === 'shortName' && value) settings.shortName = value.slice(0, MAX_SHORT_NAME);
		else if (key === 'logo') settings.logo = validLogo(value);
		else if (key === 'accent') settings.accent = parseColour(value);
		else if (key === 'look') settings.look = lookOf(value);
		else if (key === 'retention') settings.retention = seasonsOf(value);
		else if (key === 'links' && value) settings.links = parseLinks(value).slice(0, MAX_LINKS);
		else if (key === 'featuresOff') settings.featuresOff = FEATURES.filter((feature) => value.split(/[,;\s]+/).includes(feature));
	}
	return Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined)) as StoredSettings;
}

export type SettingsForm = { [K in SettingKey]: K extends 'featuresOff' ? Feature[] : string };


/** Checks what the page sent; the message names the first field that can't be saved. */
export function checkSettings(form: SettingsForm): { ok: true } | { ok: false; field: SettingKey } {
	if (form.name.trim().length > MAX_NAME) return { ok: false, field: 'name' };
	if (form.shortName.trim().length > MAX_SHORT_NAME) return { ok: false, field: 'shortName' };
	if (form.logo.trim() && !validLogo(form.logo)) return { ok: false, field: 'logo' };
	if (form.accent.trim() && !parseColour(form.accent)) return { ok: false, field: 'accent' };
	if (form.look.trim() && !lookOf(form.look.trim())) return { ok: false, field: 'look' };
	if (form.retention.trim() && !seasonsOf(form.retention)) return { ok: false, field: 'retention' };
	// Every line needs a web link, and not too many of them.
	const lines = form.links.split(/[\n;]/).filter((line) => line.trim());
	if (lines.some((line) => !parseLinks(line).length) || lines.length > MAX_LINKS) return { ok: false, field: 'links' };
	return { ok: true };
}

/** The rows to change and to add so the tab holds `form`: one row per setting, the first one found is kept. */
export function planSettingsSave(table: Table<'key' | 'value'>, form: SettingsForm) {
	const look = lookOf(form.look.trim());
	const values: Record<SettingKey, string> = {
		name: form.name.trim(),
		shortName: form.shortName.trim(),
		logo: form.logo.trim(),
		accent: parseColour(form.accent) ?? '',
		look: look ? LOOK_WORDS[look] : '',
		featuresOff: form.featuresOff.join(', '),
		retention: String(seasonsOf(form.retention) ?? ''),
		links: linksText(parseLinks(form.links))
	};
	const updates: { row: number; values: { value: string } }[] = [];
	const append: { key: string; value: string }[] = [];
	for (const key of Object.keys(SETTING_KEYS) as SettingKey[]) {
		const row = table.rows.find((r) => keyOf(r.values.key) === key);
		if (row) {
			if (row.values.value !== values[key]) updates.push({ row: row.row, values: { value: values[key] } });
		} else {
			append.push({ key: SETTING_KEYS[key], value: values[key] });
		}
	}
	return { updates, append };
}

/** Longest label, and most extra spellings with their length, per instrument. */
const MAX_LABEL = 30;
const MAX_ALIASES = 12;
const MAX_ALIAS = 40;
/** Words that can be part of a file name: letters, digits, spaces and a few joiners. */
const WORD = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;

const splitAliases = (text: string) => [...new Set(text.split(/[,;]/).map((alias) => alias.trim()).filter(Boolean))];

/** The rows of "Instrumente" by instrument name; unknown instruments and unusable words are left out. */
export function readInstrumentOverrides(
	rows: { values: { name: string; label: string; aliases: string } }[],
	known: readonly string[]
): Record<string, InstrumentOverride> {
	const result: Record<string, InstrumentOverride> = {};
	for (const { values } of rows) {
		const name = known.find((word) => word.toLowerCase() === values.name.trim().toLowerCase());
		if (!name || result[name]) continue;
		const label = values.label.trim();
		const aliases = splitAliases(values.aliases).filter((alias) => alias.length <= MAX_ALIAS && WORD.test(alias)).slice(0, MAX_ALIASES);
		const override: InstrumentOverride = {
			...(label && label.length <= MAX_LABEL && WORD.test(label) ? { label } : {}),
			...(aliases.length ? { aliases } : {})
		};
		if (override.label || override.aliases) result[name] = override;
	}
	return result;
}

export interface InstrumentFormRow {
	name: string;
	label: string;
	aliases: string;
}

/** The first instrument whose label or spellings can't be saved. */
export function checkInstruments(rows: InstrumentFormRow[]): string | undefined {
	return rows.find(({ label, aliases }) => {
		const words = splitAliases(aliases);
		return (
			(label.trim() && (label.trim().length > MAX_LABEL || !WORD.test(label.trim()))) ||
			words.length > MAX_ALIASES ||
			words.some((alias) => alias.length > MAX_ALIAS || !WORD.test(alias))
		);
	})?.name;
}

/** Rows to change and add so "Instrumente" holds the form; instruments without anything of their own get empty cells. */
export function planInstrumentSave(table: Table<'name' | 'label' | 'aliases'>, rows: InstrumentFormRow[]) {
	const updates: { row: number; values: { label: string; aliases: string } }[] = [];
	const append: { name: string; label: string; aliases: string }[] = [];
	for (const { name, label, aliases } of rows) {
		const values = { label: label.trim(), aliases: splitAliases(aliases).join(', ') };
		const existing = table.rows.find((row) => row.values.name.trim().toLowerCase() === name.toLowerCase());
		if (existing) {
			if (existing.values.label !== values.label || existing.values.aliases !== values.aliases) updates.push({ row: existing.row, values });
		} else if (values.label || values.aliases) {
			append.push({ name, ...values });
		}
	}
	return { updates, append };
}
