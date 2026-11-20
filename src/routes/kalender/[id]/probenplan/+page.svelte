<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { guardUnsaved } from '#lib/unsaved.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Crumbs from '#lib/components/Crumbs.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();

	// The editor's working copy; the page data is only the starting point.
	// svelte-ignore state_referenced_locally
	let selected = $state<Record<string, string[]>>(data.state === 'ready' ? structuredClone(data.selected) : {});
	const saving = new FormState();

	function toggle(rehearsal: string, piece: string) {
		const list = selected[rehearsal];
		const i = list.indexOf(piece);
		if (i === -1) list.push(piece);
		else list.splice(i, 1);
	}

	// Saved in programme order, so the sheet reads like the programme.
	const payload = $derived.by(() => {
		if (data.state !== 'ready') return '{}';
		const order = data.pieces.map((piece) => piece.name);
		return JSON.stringify(
			Object.fromEntries(Object.entries(selected).map(([id, names]) => [id, order.filter((name) => names.includes(name))]))
		);
	});
	// How often each piece is planned, live while ticking (#116).
	const counts = $derived.by(() => {
		if (data.state !== 'ready') return [];
		return data.pieces.map((piece) => ({
			...piece,
			total: data.rehearsals.filter((rehearsal) => selected[rehearsal.id].includes(piece.name)).length,
			upcoming: data.rehearsals.filter((rehearsal) => !rehearsal.past && selected[rehearsal.id].includes(piece.name)).length
		}));
	});
	const unplanned = $derived(counts.filter((piece) => piece.inProgram && !piece.total).length);
	const concertUrl = $derived(`/kalender/${encodeURIComponent(data.concert.id)}`);

	// svelte-ignore state_referenced_locally
	const saved = payload;
	guardUnsaved(() => payload !== saved && !saving.busy);
</script>

<Title title={t.rehearsalPlan.edit} />

<Crumbs items={[{ href: '/kalender', label: t.concerts.title }, { href: concertUrl, label: data.concert.title }]} />

<header class="head">
	<h1>{t.rehearsalPlan.pageTitle(data.concert.title)}</h1>
	<p>{t.rehearsalPlan.lead}</p>
</header>

{#if data.state === 'not-a-concert'}
	<p class="notice">{t.rehearsalPlan.notAConcert}</p>
{:else if data.state === 'not-set-up'}
	<p class="notice">{t.rehearsalPlan.notSetUp}</p>
{:else if data.state === 'no-rehearsals'}
	<p class="notice">{t.rehearsalPlan.noRehearsals}</p>
{:else if !data.pieces.length}
	<p class="notice">
		{t.rehearsalPlan.noProgram}
		<a href="{concertUrl}/programm">{t.rehearsalPlan.programLink}</a>
	</p>
{:else}
	{#if form?.message}<p class="message" role="alert">{form.message}</p>{/if}

	<section class="overview" aria-labelledby="overview-title">
		<h2 id="overview-title">{t.rehearsalPlan.overview}</h2>
		{#if unplanned}<p class="warn">{t.rehearsalPlan.unplanned(unplanned)}</p>{/if}
		<ul>
			{#each counts as piece (piece.name)}
				<li class:missing={piece.inProgram && !piece.total}>
					<span class="name">{piece.title}</span>
					<span class="times">
						{#if piece.total}
							{t.rehearsalPlan.times(piece.total)}{#if piece.upcoming < piece.total}<span class="muted">{` · ${t.rehearsalPlan.stillToCome(piece.upcoming)}`}</span>{/if}
						{:else}
							{t.rehearsalPlan.never}
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	</section>

	<ol class="rehearsals">
		{#each data.rehearsals as rehearsal (rehearsal.id)}
			{@const chosen = selected[rehearsal.id]}
			<li class="rehearsal" class:past={rehearsal.past}>
				<div class="when">
					<span class="date">
						<span class="day">{rehearsal.date.day}</span>
						<span class="month">{rehearsal.date.month}</span>
					</span>
					<span class="what">
						<strong>{rehearsal.title}</strong>
						<span class="muted">
							{rehearsal.date.weekday}{rehearsal.date.time ? ` · ${rehearsal.date.time}` : ''}
							{#if rehearsal.past}<span class="tag">{t.rehearsalPlan.past}</span>{/if}
						</span>
					</span>
					<span class="count">{t.rehearsalPlan.count(chosen.length)}</span>
				</div>
				<div class="pieces" role="group" aria-label={rehearsal.title}>
					{#each data.pieces as piece (piece.name)}
						{@const on = chosen.includes(piece.name)}
						{@const note = data.notes[rehearsal.id]?.[piece.name]}
						<button
							type="button"
							class="chip"
							class:on
							aria-pressed={on}
							title={[piece.subtitle, note].filter(Boolean).join(' · ') || undefined}
							onclick={() => toggle(rehearsal.id, piece.name)}
						>
							{#if on}<Icon name="check" size={14} />{/if}
							<span>{piece.title}</span>
							{#if !piece.inProgram}<span class="hint">{t.rehearsalPlan.notInProgram}</span>{/if}
							{#if note && on}<span class="hint">{note}</span>{/if}
						</button>
					{/each}
				</div>
				<div class="quick">
					<button type="button" onclick={() => (selected[rehearsal.id] = data.pieces.map((piece) => piece.name))}>{t.rehearsalPlan.all}</button>
					<button type="button" onclick={() => (selected[rehearsal.id] = [])}>{t.rehearsalPlan.none}</button>
				</div>
			</li>
		{/each}
	</ol>

	<form method="POST" use:enhance={saving.submit()}>
		<input type="hidden" name="plan" value={payload} />
		<input type="hidden" name="version" value={data.version} />
		<button class="button" disabled={saving.busy}><Icon name="check" size={16} />{t.rehearsalPlan.save}</button>
		<a class="cancel" href={concertUrl}>{t.rehearsalPlan.cancel}</a>
	</form>
{/if}

<style>

	.head {
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-5);
	}

	.head p,
	.muted {
		color: var(--text-muted);
	}

	.muted {
		font-size: var(--text-sm);
	}

	.overview {
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.overview h2 {
		margin: 0;
		font-size: var(--text-base);
	}

	.overview ul {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-md);
	}

	.overview li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-1) 0;
	}

	.overview li + li {
		border-top: 1px solid var(--border);
	}

	.overview .name {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.overview .times {
		flex: none;
		font-weight: 600;
		text-align: right;
	}

	.overview li.missing .times,
	.warn {
		color: var(--warn);
	}

	.warn {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.rehearsals {
		display: grid;
		gap: var(--space-3);
		margin: 0 0 var(--space-5);
		padding: 0;
		list-style: none;
	}

	.rehearsal {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.rehearsal.past {
		opacity: 0.7;
	}

	.when {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.date {
		display: grid;
		place-items: center;
		flex: none;
		width: 48px;
		height: 48px;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
		line-height: 1;
	}

	.day {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.month {
		font-size: var(--text-2xs);
		font-weight: 700;
		text-transform: uppercase;
	}

	.what {
		display: grid;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.what strong {
		overflow-wrap: anywhere;
	}

	.count {
		flex: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.tag {
		margin-left: var(--space-1);
		padding: 0 6px;
		border-radius: var(--radius-xs);
		background: var(--surface-2);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.pieces {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		max-width: 100%;
		min-height: 36px;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: var(--text-md);
		text-align: left;
		cursor: pointer;
		transition:
			background 120ms,
			border-color 120ms,
			color 120ms;
	}

	.chip span {
		overflow-wrap: anywhere;
	}

	.chip:hover {
		border-color: var(--accent);
	}

	.chip.on {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.chip .hint {
		opacity: 0.75;
		font-size: var(--text-2xs);
	}

	.quick {
		display: flex;
		gap: var(--space-3);
	}

	.quick button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
	}

	form {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-5);
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--accent-contrast);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.button:disabled {
		opacity: 0.6;
		cursor: progress;
	}

	.cancel {
		color: var(--text-muted);
		font-weight: 500;
	}

	.notice,
	.message {
		margin-bottom: var(--space-4);
		padding: var(--space-4);
		border-radius: var(--radius-m);
	}

	.notice {
		border: 1px dashed var(--border);
		color: var(--text-muted);
	}

	.notice a {
		color: var(--accent);
		font-weight: 600;
	}

	.message {
		background: color-mix(in oklab, var(--danger) 10%, transparent);
	}
</style>
