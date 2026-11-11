<script lang="ts">
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.ts';

	/** Demo mode (#121): says that the data is invented, and switches between the two demo users. */
	let { role }: { role: 'verwaltung' | 'mitglied' | 'eltern' } = $props();
	const back = $derived(page.url.pathname + page.url.search);
</script>

<form class="demo" method="POST" action="/demo">
	<input type="hidden" name="weiter" value={back} />
	<span class="label" title={t.demo.note}><strong>{t.demo.label}</strong><span class="note">{t.demo.note}</span></span>
	<span class="roles" role="group" aria-label={t.demo.viewAs}>
		<button name="rolle" value="verwaltung" aria-pressed={role === 'verwaltung'}>{t.demo.admin}</button>
		<button name="rolle" value="mitglied" aria-pressed={role === 'mitglied'}>{t.demo.member}</button>
		<button name="rolle" value="eltern" aria-pressed={role === 'eltern'}>{t.demo.parent}</button>
	</span>
	<button class="reset" name="zuruecksetzen" value="1">{t.demo.reset}</button>
</form>

<style>
	.demo {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-2) var(--space-4);
		background: var(--accent-soft);
		color: var(--text);
		font-size: var(--text-xs);
	}

	.label {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-2);
	}

	strong {
		color: var(--accent);
	}

	.note {
		color: var(--text-muted);
	}

	.roles {
		display: inline-flex;
		padding: 2px;
		border-radius: var(--radius-pill);
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--border);
	}

	.roles button,
	.reset {
		min-height: 28px;
		padding: 0 var(--space-3);
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.roles button[aria-pressed='true'] {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.reset {
		color: var(--accent);
	}

	/*
	 * One slim row on phones: the explanation is in the tooltip and the README. A second row
	 * where the words are wider than the screen (three roles since the parents' area): a bar
	 * wider than the phone widens the whole page, and taps land beside their buttons.
	 */
	@media (max-width: 640px) {
		.demo {
			flex-wrap: wrap;
			justify-content: space-between;
			gap: 4px var(--space-2);
			padding: 6px var(--space-4);
		}

		.note {
			display: none;
		}

		.roles button,
		.reset {
			padding: 0 var(--space-2);
		}
	}
</style>
