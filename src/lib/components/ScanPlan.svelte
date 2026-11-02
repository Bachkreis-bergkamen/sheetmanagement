<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState, showToast } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import { PRIORITIES, type Priority } from '#lib/repertoire/missing-parts.ts';
	import Icon from './Icon.svelte';

	/**
	 * Plans a scan: a priority and who scans, for one gap or every gap of a piece. On
	 * "Fehlende Stimmen" and the piece page; both have a "planScan" action.
	 */

	let {
		ids,
		priority,
		assignee,
		scanners,
		label = t.gaps.plan,
		hint
	}: {
		/** The gaps' file ids. */
		ids: string[];
		priority?: Priority;
		assignee?: string;
		scanners: { email: string; name: string }[];
		label?: string;
		hint?: string;
	} = $props();

	const saving = new FormState();
	let open = $state(false);
</script>

<details class="plan" bind:open>
	<summary><Icon name="edit" size={13} />{label}</summary>
	<form
		method="POST"
		action="?/planScan"
		use:enhance={saving.submit({
			onSuccess: () => ((open = false), showToast(t.gaps.saved)),
			onFailure: (data) => showToast(String(data?.message ?? t.common.saveFailed))
		})}
	>
		{#each ids as id (id)}<input type="hidden" name="id" value={id} />{/each}
		{#if hint}<p class="hint">{hint}</p>{/if}
		<label class="field">
			{t.gaps.priority}
			<select name="priority" value={priority ?? ''}>
				<option value="">{t.gaps.noPriority}</option>
				{#each PRIORITIES as option (option)}<option value={option}>{t.gaps.priorities[option]}</option>{/each}
			</select>
		</label>
		<label class="field">
			{t.gaps.assignee}
			<select name="assignee" value={assignee ?? ''}>
				<option value="">{t.gaps.nobody}</option>
				{#each scanners as person (person.email)}<option value={person.email}>{person.name}</option>{/each}
			</select>
		</label>
		<div class="actions">
			<button class="btn small" disabled={saving.busy}><Icon name="check" size={16} />{t.gaps.save}</button>
			<button type="button" class="btn small ghost" onclick={() => (open = false)}>{t.gaps.cancel}</button>
		</div>
	</form>
</details>

<style>
	/* In a wrapping row of badges: opened, the form takes a line of its own. */
	.plan[open] {
		flex-basis: 100%;
	}

	summary {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text);
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:hover,
	.plan[open] summary {
		border-color: var(--accent);
		color: var(--accent);
	}

	form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
		gap: var(--space-3);
		margin: var(--space-1) 0 var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
		background: var(--surface-2);
	}

	.field {
		margin: 0;
	}

	.hint {
		grid-column: 1 / -1;
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		grid-column: 1 / -1;
		gap: var(--space-2);
	}
</style>
