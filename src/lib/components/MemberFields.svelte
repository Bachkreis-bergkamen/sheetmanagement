<script lang="ts">
	import { MEMBER_STATUSES } from '#lib/access/access.ts';
	import { t } from '#lib/i18n/index.ts';
	import InstrumentPicker from './InstrumentPicker.svelte';

	/** Name, instruments, orchestras and status of one member; read on the server with readMemberForm. */
	let {
		member,
		instruments,
		common,
		orchestras
	}: {
		member: {
			name: string;
			choices: { instrument: string; numbers: number[] }[];
			orchestras: string[];
			status: string;
			pausedUntil?: string;
		};
		instruments: string[];
		common: string[];
		/** The configured orchestras; with only one there is nothing to pick. */
		orchestras: string[];
	} = $props();

	// svelte-ignore state_referenced_locally
	let status = $state(member.status);
</script>

<div class="fields">
	<label class="field">{t.profile.name}<input name="name" value={member.name} autocomplete="name" maxlength="200" /></label>

	<div class="group" data-tour="instruments">
		<span class="caption">{t.profile.instruments}</span>
		<InstrumentPicker choices={member.choices} {instruments} {common} />
	</div>

	{#if orchestras.length > 1}
		<fieldset class="group">
			<legend class="caption">{t.profile.orchestras}</legend>
			<div class="checks">
				{#each orchestras as orchestra (orchestra)}
					<label class="check"><input type="checkbox" name="orchestra" value={orchestra} checked={member.orchestras.includes(orchestra)} />{orchestra}</label>
				{/each}
			</div>
			<span class="hint">{t.profile.orchestrasHint}</span>
		</fieldset>
	{/if}

	<div class="status">
		<label class="field">
			{t.profile.status}
			<select name="status" bind:value={status}>
				{#each MEMBER_STATUSES as option (option)}<option value={option}>{t.profile.statuses[option]}</option>{/each}
			</select>
		</label>
		{#if status === 'pausiert'}
			<label class="field">{t.profile.pausedUntil}<input name="pausedUntil" type="date" value={member.pausedUntil ?? ''} /></label>
		{/if}
		<span class="hint wide">{t.profile.statusHints[status]}</span>
	</div>
</div>

<style>
	.fields {
		display: grid;
		gap: var(--space-4);
	}

	.group {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.caption {
		padding: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
	}

	.check input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}

	.status {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-2) var(--space-3);
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.wide {
		flex-basis: 100%;
	}
</style>
