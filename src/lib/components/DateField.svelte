<script lang="ts">
	import { config } from '#lib/config/index.ts';
	import { t } from '#lib/i18n/index.ts';
	import { numericDate } from '#lib/repertoire/concert-ref.ts';
	import { formatFuzzyDate, fuzzyDateKey, parseFuzzyDate } from '#lib/repertoire/dates.ts';
	import Icon from './Icon.svelte';

	/**
	 * A date typed the German way, "21.12.1957". The browser's own date field writes in
	 * the phone's language, MM/DD/YYYY on an English one, so 03/12 meant 12 March to it and
	 * 3 December to us. Here the order is always day, month, year; the date is said back in
	 * words, and the calendar button still offers the browser's picker. The form gets
	 * "1957-12-21" under `name`; with `fuzzy`, also "1957-12" or "1957" for old concerts.
	 */
	let {
		name,
		label,
		value = $bindable(''),
		fuzzy = false,
		required = false,
		max = '',
		hint = ''
	}: {
		name: string;
		label: string;
		/** "1957-12-21" (or "1957-12", "1957" with `fuzzy`); empty when nothing readable is typed. */
		value?: string;
		fuzzy?: boolean;
		required?: boolean;
		/** The last day allowed, "2027-06-30". */
		max?: string;
		hint?: string;
	} = $props();

	const shown = (key: string) => {
		const date = parseFuzzyDate(key);
		return date ? numericDate(date) : key;
	};
	// svelte-ignore state_referenced_locally
	let text = $state(shown(value));
	let input: HTMLInputElement | undefined = $state();
	let picker: HTMLInputElement | undefined = $state();
	/** What this field last gave the form; any other value came from outside (a refused form, a reset). */
	// svelte-ignore state_referenced_locally
	let sent = value;
	$effect(() => {
		if (value !== sent) {
			sent = value;
			text = shown(value);
		}
	});

	const parsed = $derived(parseFuzzyDate(text.trim()));
	const complete = $derived(!!parsed && (fuzzy || !!parsed.day));
	const key = $derived(parsed && complete ? fuzzyDateKey(parsed) : '');
	const tooLate = $derived(!!key && !!max && key.slice(0, 10) > max);
	const problem = $derived(
		!text.trim() ? '' : !complete ? (fuzzy ? t.dateField.unreadableFuzzy : t.dateField.unreadable) : tooLate ? t.dateField.tooLate(shown(max)) : ''
	);
	$effect(() => {
		sent = tooLate ? '' : key;
		value = sent;
		input?.setCustomValidity(problem);
	});

	function pick() {
		if (!picker) return;
		picker.value = key.length === 10 ? key : '';
		try {
			picker.showPicker();
		} catch {
			picker.click();
		}
	}
</script>

<label class="field date-field">
	{label}
	<span class="row">
		<input
			bind:this={input}
			bind:value={text}
			inputmode="numeric"
			autocomplete="off"
			placeholder={fuzzy ? t.dateField.placeholderFuzzy : t.dateField.placeholder}
			aria-invalid={!!problem}
			{required}
		/>
		<button type="button" class="pick" aria-label={t.dateField.pick} title={t.dateField.pick} onclick={pick}><Icon name="calendar" size={16} /></button>
		<input
			bind:this={picker}
			class="native"
			type="date"
			tabindex="-1"
			aria-hidden="true"
			max={max || undefined}
			onchange={() => picker?.value && (text = shown(picker.value))}
		/>
	</span>
	<span class="said" class:problem aria-live="polite">
		{problem || (parsed && complete ? formatFuzzyDate(parsed, config.locale).long : hint)}
	</span>
</label>
<input type="hidden" {name} {value} />

<style>
	.row {
		position: relative;
		display: flex;
		gap: var(--space-2);
	}

	.row input:first-child {
		flex: 1;
		min-width: 0;
	}

	.pick {
		flex: none;
		display: inline-grid;
		place-items: center;
		width: 2.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-s);
		background: var(--surface);
		color: var(--text-muted);
		cursor: pointer;
	}

	.pick:hover {
		color: var(--text);
	}

	/* The browser's picker opens from here; the field itself stays out of sight. */
	.native {
		position: absolute;
		right: 0;
		bottom: 0;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.said {
		min-height: 1.2em;
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: normal;
	}

	.said.problem {
		color: var(--danger);
	}
</style>
