<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import Icon from './Icon.svelte';

	/**
	 * Who plays which part instead of their own (#262), on a piece's page: the saxophones on the
	 * bassoon part, one member on the bass. Everyone sees them; the conductor and the librarian
	 * add and delete them, for this piece or every piece, for one concert or always.
	 */

	interface Assignment {
		id: string;
		who: string;
		part: string;
		everyPiece: boolean;
		concert?: string;
		by: string;
		at: string;
	}
	type Option = { value: string; label: string };

	let {
		assignments,
		result
	}: {
		assignments: {
			list: Assignment[];
			form: { who: { instruments: Option[]; members: Option[] }; parts: Option[]; numbers: number[]; concerts: Option[] } | null;
		};
		result?: { assignError?: string; assignSaved?: boolean; assignDeleted?: boolean } | null;
	} = $props();

	const saving = new FormState();
	// svelte-ignore state_referenced_locally
	let adding = $state(!!result?.assignError);
</script>

{#if assignments.list.length || assignments.form}
	<section class="block part-assignments" aria-labelledby="part-assignments-title">
		<h2 class="ui-label" id="part-assignments-title"><Icon name="parts" size={14} />{t.partAssignments.title}</h2>
		{#if result?.assignError}<p class="msg error" role="alert">{result.assignError}</p>{/if}
		{#if result?.assignSaved}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.partAssignments.saved}</p>{/if}
		{#if result?.assignDeleted}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.partAssignments.deleted}</p>{/if}

		{#if assignments.list.length}
			<ul class="assignments">
				{#each assignments.list as assignment, i (i)}
					<li class="assignment">
						<p class="text">{t.partAssignments.plays(assignment.who, assignment.part)}</p>
						<div class="meta">
							{#if assignment.everyPiece}<span class="tag">{t.partAssignments.everyPiece}</span>{/if}
							<span class="tag concert">{assignment.concert ? t.partAssignments.onlyConcert(assignment.concert) : t.partAssignments.forever}</span>
							<span class="muted">{t.partAssignments.meta(assignment.by, assignment.at)}</span>
							{#if assignments.form && assignment.id}
								<form method="POST" action="?/deleteAssignment" use:enhance={saving.submit()}>
									<input type="hidden" name="id" value={assignment.id} />
									<button
										class="delete"
										disabled={saving.busy}
										aria-label={t.partAssignments.deleteNamed(assignment.who, assignment.part)}
										title={t.partAssignments.delete}
									>
										<Icon name="trash" size={15} />
									</button>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{:else if assignments.form}
			<p class="muted none">{t.partAssignments.none}</p>
		{/if}

		{#if assignments.form}
			<details class="add" bind:open={adding}>
				<summary><Icon name="plus" size={16} />{t.partAssignments.add}</summary>
				<form method="POST" action="?/addAssignment" use:enhance={saving.submit({ reset: true, onSuccess: () => (adding = false) })}>
					<p class="muted wide lead">{t.partAssignments.lead}</p>
					<label class="field">
						{t.partAssignments.who}
						<select name="who" required>
							<option value="" disabled selected></option>
							<optgroup label={t.partAssignments.instruments}>
								{#each assignments.form.who.instruments as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
							</optgroup>
							{#if assignments.form.who.members.length}
								<optgroup label={t.partAssignments.members}>
									{#each assignments.form.who.members as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
								</optgroup>
							{/if}
						</select>
					</label>
					<div class="part">
						<label class="field">
							{t.partAssignments.part}
							<select name="part" required>
								<option value="" disabled selected></option>
								{#each assignments.form.parts as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
							</select>
						</label>
						<label class="field number">
							{t.partAssignments.number}
							<select name="number">
								<option value="">{t.partAssignments.anyNumber}</option>
								{#each assignments.form.numbers as n (n)}<option value={n}>{n}</option>{/each}
							</select>
						</label>
					</div>
					<label class="field">
						{t.partAssignments.concert}
						<select name="concert">
							<option value="">{t.partAssignments.always}</option>
							{#each assignments.form.concerts as concert (concert.value)}<option value={concert.value}>{concert.label}</option>{/each}
						</select>
					</label>
					<label class="check wide">
						<input type="checkbox" name="everyPiece" />
						{t.partAssignments.allPieces}
					</label>
					<div class="wide">
						<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{t.partAssignments.save}</button>
					</div>
				</form>
			</details>
		{/if}
	</section>
{/if}

<style>
	.block {
		margin-bottom: var(--space-6);
	}

	.msg {
		margin-bottom: var(--space-2);
	}

	.ui-label {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.assignments {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.assignment {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.text {
		margin: 0;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
	}

	.tag {
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}

	.tag.concert {
		background: var(--surface-2);
		color: var(--text);
	}

	.muted {
		color: var(--text-muted);
	}

	.none {
		margin: 0 0 var(--space-2) var(--space-1);
	}

	.lead {
		margin: 0;
		font-size: var(--text-sm);
	}

	.meta form {
		margin-left: auto;
	}

	.delete {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: var(--radius-s);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.delete:hover,
	.delete:focus-visible {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.add {
		margin-top: var(--space-3);
	}

	.add summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 36px;
		color: var(--accent);
		font-size: var(--text-md);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}

	.add summary::-webkit-details-marker {
		display: none;
	}

	.add form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
		gap: var(--space-3);
		margin-top: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.part {
		display: grid;
		grid-template-columns: 1fr 5.5rem;
		gap: var(--space-2);
	}

	.wide {
		grid-column: 1 / -1;
	}

	.add .field {
		margin: 0;
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 36px;
	}
</style>
