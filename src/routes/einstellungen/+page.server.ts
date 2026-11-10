import { error, redirect, fail } from '@sveltejs/kit';
import { FEATURES, type Feature } from '#lib/features.ts';
import { t } from '#lib/i18n/index.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { defaultSettings, features, offeredFeature } from '#lib/server/env.ts';
import { refreshStoredSettings } from '#lib/server/repertoire.ts';
import { appendRecords, ensureTab, readTab, refreshAfterWrite, SheetLayoutError, updateRecords } from '#lib/server/sheet-writes.ts';
import { NotConfiguredError } from '#lib/server/services.ts';
import { PRESET_INSTRUMENTS, type InstrumentOverride } from '#lib/config/index.ts';
import { linksText } from '#lib/links.ts';
import { instrumentLabel } from '#lib/music/instrument-label.ts';
import {
	checkInstruments,
	checkSettings,
	planInstrumentSave,
	planSettingsSave,
	readInstrumentOverrides,
	readSettings,
	type InstrumentFormRow,
	type SettingsForm
} from '#lib/settings.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Name, logo, colour, look, links and the parts of the app in use, set by an admin (#75, #134, #163). Saved in the
 * sheet's "Einstellungen" tab; an empty field falls back to the variable or the preset.
 */

function requireAdmin(locals: App.Locals) {
	// Changes everyone's app, so only with sign-in on and only for admins. While sign-in is
	// off the settings start at their status, which is how a deployment is set up (#185).
	if (locals.auth === 'off') redirect(303, '/einstellungen/status');
	requireRight(locals, 'mitglieder.verwalten');
}

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	let stored: ReturnType<typeof readSettings> = {};
	let ownInstruments: Record<string, InstrumentOverride> = {};
	let sheet: 'ready' | 'not-configured' | 'failed' = 'ready';
	try {
		stored = readSettings((await readTab('settings').catch(missingTab)).rows);
		ownInstruments = readInstrumentOverrides((await readTab('instruments').catch(missingTab)).rows, instrumentNames());
	} catch (cause) {
		if (cause instanceof NotConfiguredError) sheet = 'not-configured';
		else {
			console.error('Reading the settings failed:', cause);
			sheet = 'failed';
		}
	}
	const defaults = defaultSettings();
	const on = features();
	return {
		sheet,
		values: {
			name: stored.name ?? '',
			shortName: stored.shortName ?? '',
			logo: stored.logo ?? '',
			accent: stored.accent ?? '',
			look: stored.look ?? '',
			retention: stored.retention ? String(stored.retention) : '',
			links: linksText(stored.links ?? [])
		},
		defaults: {
			name: defaults.name,
			shortName: defaults.shortName,
			logo: defaults.logo,
			accent: defaults.accent,
			accentLight: defaults.accentLight,
			look: defaults.look,
			links: linksText(defaults.links)
		},
		features: FEATURES.filter(offeredFeature).map((feature) => ({ key: feature, on: on[feature], default: defaults.features[feature] })),
		/** Whether the page decides the features, or FEATURES_OFF and the preset still do. */
		featuresStored: !!stored.featuresOff,
		// Each instrument with the file names' word, the preset's label and spellings, and the orchestra's own.
		instruments: PRESET_INSTRUMENTS.filter((instrument) => !instrument.voice).map((instrument) => ({
			name: instrument.name,
			presetLabel: instrument.label ?? '',
			presetAliases: instrument.aliases ?? [],
			label: ownInstruments[instrument.name]?.label ?? '',
			aliases: (ownInstruments[instrument.name]?.aliases ?? []).join(', ')
		}))
	};
};

export const actions: Actions = {
	settings: async ({ locals, request }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const text = (name: string) => String(data.get(name) ?? '');
		const on = new Set(data.getAll('features').map(String));
		const form: SettingsForm = {
			name: text('name'),
			shortName: text('shortName'),
			logo: text('logo'),
			// The colour picker always sends a colour; "default" keeps the field empty.
			accent: data.has('accentDefault') ? '' : text('accent'),
			look: text('look'),
			// An opt-in feature the page doesn't offer stays out of the list, so turning it on later works.
			featuresOff: FEATURES.filter((feature: Feature) => offeredFeature(feature) && !on.has(feature)),
			retention: text('retention'),
			links: text('links')
		};
		const check = checkSettings(form);
		// What was typed comes back, so nothing is lost when the page reloads without JavaScript.
		if (!check.ok) {
			return fail(400, {
				field: check.field,
				message: t.settings.invalid[check.field],
				values: { name: form.name, shortName: form.shortName, logo: form.logo, accent: form.accent, look: form.look, retention: form.retention, links: form.links }
			});
		}
		try {
			await ensureTab('settings');
			const table = await readTab('settings');
			const plan = planSettingsSave(table, form);
			await updateRecords('settings', table, plan.updates);
			await appendRecords('settings', table, plan.append);
			// A fresh read, so the layout's colours and menu already show what was saved.
			await refreshAfterWrite();
			await refreshStoredSettings();
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { message: cause.message });
			console.error('Saving the settings failed:', cause);
			return fail(503, { message: t.settings.failed });
		}
		return { saved: true };
	},

	instruments: async ({ locals, request }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const rows: InstrumentFormRow[] = instrumentNames().map((name) => ({
			name,
			label: String(data.get(`label:${name}`) ?? ''),
			aliases: String(data.get(`aliases:${name}`) ?? '')
		}));
		const invalid = checkInstruments(rows);
		if (invalid) return fail(400, { instrumentsMessage: t.settings.invalidInstrument(instrumentLabel(invalid)) });
		try {
			await ensureTab('instruments');
			const table = await readTab('instruments');
			const plan = planInstrumentSave(table, rows);
			await updateRecords('instruments', table, plan.updates);
			await appendRecords('instruments', table, plan.append);
			await refreshAfterWrite();
			await refreshStoredSettings();
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { instrumentsMessage: cause.message });
			console.error('Saving the instruments failed:', cause);
			return fail(503, { instrumentsMessage: t.settings.failed });
		}
		return { instrumentsSaved: true };
	}
};

/** The instruments a deployment can name differently; numbered voices ("Stimme 3") aren't among them. */
const instrumentNames = () => PRESET_INSTRUMENTS.filter((instrument) => !instrument.voice).map((instrument) => instrument.name);

/** A tab that isn't there yet reads as empty; the first save creates it. */
function missingTab(cause: unknown): { rows: [] } {
	if (cause instanceof SheetLayoutError) return { rows: [] };
	throw cause;
}
