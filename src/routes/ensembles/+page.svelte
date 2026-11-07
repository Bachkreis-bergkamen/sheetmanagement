<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const adding = new FormState();
	const saving = new FormState();
	const removing = new FormState();
	type Row = (typeof data.ensembles)[number];
	type Values = Row['values'];

	let query = $state('');
	/** The row whose form is open; one at a time. */
	let editing = $state<number | null>(null);
	// svelte-ignore state_referenced_locally
	let addOpen = $state(!data.ensembles.length);

	const shown = $derived.by(() => {
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		if (!words.length) return data.ensembles;
		return data.ensembles.filter((ensemble) => {
			const text = Object.values(ensemble.values).join(' ').toLowerCase();
			return words.every((word) => text.includes(word));
		});
	});

	/** What the form shows: what was typed when a save was refused, else the row. */
	const valuesFor = (row: number | undefined, fallback: Values) => (form && 'values' in form && form.values && form.row === row ? (form.values as Values) : fallback);
	const emptyValues: Values = { shortName: '', name: '', kind: '', conductor: '', website: '', logo: '' };
	const addError = $derived(form && 'message' in form && form.message && form.row === undefined ? form.message : null);

	// A refused save opens its form again.
	$effect(() => {
		if (form && 'message' in form && form.message) {
			if (typeof form.row === 'number') editing = form.row;
			else addOpen = true;
		}
	});

	/** "Kammerchor Unna" → "KU", for ensembles without a logo. */
	const initials = (name: string) =>
		name
			.split(/\s+/)
			.filter((word) => /^\p{L}/u.test(word))
			.slice(0, 2)
			.map((word) => word[0].toUpperCase())
			.join('') || name.slice(0, 2).toUpperCase();
	const host = (url: string) => {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	};
</script>

<Title title={t.ensembles.title} />
<PageHeader title={t.ensembles.title} lead={t.ensembles.lead} />

{#snippet fields(values: Values, locked: boolean, id: string)}
	<label class="field">
		{t.ensembles.name}
		<input name="name" maxlength="300" autocomplete="off" placeholder={t.ensembles.nameHint} value={values.name} />
	</label>
	<label class="field">
		{t.ensembles.shortName}
		<input name="shortName" maxlength="300" autocomplete="off" placeholder={t.ensembles.shortNameHint} value={values.shortName} readonly={locked} aria-describedby={locked ? `${id}-locked` : undefined} />
		{#if locked}<small class="hint" id="{id}-locked">{t.ensembles.shortLocked}</small>{/if}
	</label>
	<label class="field">
		{t.ensembles.kind}
		<input name="kind" maxlength="300" list="ensemble-kinds" autocomplete="off" value={values.kind} />
	</label>
	<label class="field">
		{t.ensembles.conductor}
		<input name="conductor" maxlength="300" autocomplete="off" value={values.conductor} />
	</label>
	<label class="field">
		{t.ensembles.website}
		<input name="website" type="text" inputmode="url" maxlength="300" autocomplete="off" placeholder="https://" value={values.website} />
	</label>
	<label class="field">
		{t.ensembles.logo}
		<input name="logo" type="text" inputmode="url" maxlength="300" autocomplete="off" placeholder={t.ensembles.logoHint} value={values.logo} />
	</label>
{/snippet}

<datalist id="ensemble-kinds">{#each data.kinds as kind (kind)}<option value={kind}></option>{/each}</datalist>

{#if form && 'added' in form}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.ensembles.added(String(form.added))}</p>{/if}
{#if form && 'removed' in form}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.ensembles.removed(String(form.removed))}</p>{/if}

<details class="ui-card add" bind:open={addOpen}>
	<summary><Icon name="plus" size={16} />{t.ensembles.add}</summary>
	<p class="muted">{t.ensembles.addLead}</p>
	<form method="POST" action="?/add" class="grid" use:enhance={adding.submit({ reset: true })}>
		{@render fields(valuesFor(undefined, emptyValues), false, 'new')}
		{#if addError}<p class="msg error wide" role="alert">{addError}</p>{/if}
		<div class="wide"><button class="btn" disabled={adding.busy}><Icon name="plus" size={16} />{t.ensembles.create}</button></div>
	</form>
</details>

{#if data.ensembles.length}
	<div class="toolbar">
		<label class="search">
			<Icon name="search" size={16} />
			<input type="search" bind:value={query} placeholder={t.ensembles.search} aria-label={t.ensembles.search} />
		</label>
		<span class="muted">{t.ensembles.count(shown.length)}</span>
	</div>
{/if}

{#if !data.ensembles.length}
	<p class="msg info">{t.ensembles.empty}</p>
{:else if !shown.length}
	<p class="msg info">{t.ensembles.noMatch}</p>
{:else}
	<ul class="cards">
		{#each shown as ensemble (ensemble.row)}
			{@const used = ensemble.concerts.length > 0}
			{@const open = editing === ensemble.row}
			<li class="ui-card ensemble" class:open>
				<div class="top">
					{#if ensemble.shown.logo}
						<img class="logo" src={ensemble.shown.logo} alt="" loading="lazy" referrerpolicy="no-referrer" />
					{:else}
						<span class="logo monogram" aria-hidden="true">{initials(ensemble.shown.name)}</span>
					{/if}
					<div class="names">
						<h2>{ensemble.shown.name}</h2>
						<span class="meta">
							{#if ensemble.shown.shortName !== ensemble.shown.name}<span class="chip short">{ensemble.shown.shortName}</span>{/if}
							{#if ensemble.shown.kind}<span class="chip">{ensemble.shown.kind}</span>{/if}
						</span>
					</div>
					<button
						type="button"
						class="icon-btn"
						aria-expanded={open}
						aria-label={`${t.ensembles.edit}: ${ensemble.shown.name}`}
						title={t.ensembles.edit}
						onclick={() => (editing = open ? null : ensemble.row)}
					>
						<Icon name={open ? 'x' : 'edit'} size={18} />
					</button>
				</div>

				{#if ensemble.shown.conductor || ensemble.shown.website}
					<ul class="facts">
						{#if ensemble.shown.conductor}<li><Icon name="user" size={14} />{t.partners.conductor(ensemble.shown.conductor)}</li>{/if}
						{#if ensemble.shown.website}
							<li><Icon name="globe" size={14} /><a href={ensemble.shown.website} target="_blank" rel="noopener noreferrer">{host(ensemble.shown.website)}</a></li>
						{/if}
					</ul>
				{/if}

				<div class="used">
					{#if used}
						<span class="over">{t.ensembles.concerts(ensemble.concerts.length)}</span>
						<span class="concerts">
							{#each ensemble.concerts.slice(0, 4) as concert (concert.id)}
								<a href="/kalender/{encodeURIComponent(concert.id)}">{concert.title}{#if concert.date}<small>{concert.date}</small>{/if}</a>
							{/each}
							{#if ensemble.concerts.length > 4}<span class="more">+{ensemble.concerts.length - 4}</span>{/if}
						</span>
					{:else}
						<span class="over">{t.ensembles.unused}</span>
					{/if}
				</div>

				{#if open}
					<form method="POST" action="?/save" class="grid edit" use:enhance={saving.submit({ onSuccess: () => (editing = null) })}>
						<input type="hidden" name="row" value={ensemble.row} />
						<input type="hidden" name="was" value={ensemble.shown.shortName} />
						{@render fields(valuesFor(ensemble.row, ensemble.values), used, `e${ensemble.row}`)}
						{#if form && 'message' in form && form.message && form.row === ensemble.row}<p class="msg error wide" role="alert">{form.message}</p>{/if}
						<div class="wide actions">
							<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{t.ensembles.save}</button>
							<button type="button" class="btn ghost" onclick={() => (editing = null)}>{t.ensembles.cancel}</button>
							<button
								class="btn ghost danger"
								formaction="?/remove"
								disabled={removing.busy || used}
								title={used ? t.ensembles.inUseRemove : undefined}
								onclick={(event) => {
									if (!confirm(t.ensembles.removeConfirm(ensemble.shown.name))) event.preventDefault();
								}}
							>
								<Icon name="trash" size={16} />{t.ensembles.remove}
							</button>
						</div>
						{#if used}<p class="hint wide">{t.ensembles.inUseRemove}</p>{/if}
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.msg[role='status'] {
		margin-bottom: var(--space-4);
	}

	.add {
		margin-bottom: var(--space-6);
		padding: var(--space-4) var(--space-5);
	}

	.add summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
		color: var(--accent);
		font-weight: 600;
		list-style: none;
		cursor: pointer;
	}

	.add summary::-webkit-details-marker {
		display: none;
	}

	.add[open] summary {
		margin-bottom: var(--space-2);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-3);
		margin-top: var(--space-3);
	}

	.wide {
		grid-column: 1 / -1;
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 400;
	}

	input[readonly] {
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.search {
		display: flex;
		flex: 1;
		align-items: center;
		gap: var(--space-2);
		max-width: 360px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text-muted);
	}

	.search:focus-within {
		border-color: var(--accent);
	}

	.search input {
		flex: 1;
		min-height: 40px;
		border: 0;
		background: none;
		color: var(--text);
		outline: none;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.ensemble {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
	}

	/* The open form needs the whole row. */
	.ensemble.open {
		grid-column: 1 / -1;
	}

	.top {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.logo {
		flex: none;
		width: 52px;
		height: 52px;
		border-radius: var(--radius-md, 12px);
		background: var(--surface-2);
		object-fit: contain;
	}

	.monogram {
		display: grid;
		place-items: center;
		background: color-mix(in oklab, var(--accent) 14%, var(--surface));
		color: var(--accent);
		font-size: var(--text-lg);
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.names {
		display: grid;
		flex: 1;
		gap: var(--space-1);
		min-width: 0;
	}

	.names h2 {
		overflow-wrap: anywhere;
		font-size: var(--text-md);
		line-height: 1.3;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.chip {
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.chip.short {
		background: color-mix(in oklab, var(--accent) 12%, transparent);
		color: var(--accent);
	}

	.icon-btn {
		display: grid;
		flex: none;
		place-items: center;
		align-self: flex-start;
		width: 36px;
		height: 36px;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.icon-btn:hover,
	.icon-btn[aria-expanded='true'] {
		background: var(--surface-2);
		color: var(--text);
	}

	.facts {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
		list-style: none;
	}

	.facts li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.facts a {
		overflow: hidden;
		color: var(--accent);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.used {
		display: grid;
		gap: var(--space-1);
		margin-top: auto;
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}

	.over {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.concerts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-2);
		font-size: var(--text-sm);
	}

	.concerts a {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}

	.concerts a:hover {
		color: var(--accent);
		text-decoration: underline;
	}

	.concerts small {
		margin-left: var(--space-1);
		color: var(--text-muted);
		font-weight: 400;
	}

	.more {
		color: var(--text-muted);
	}

	.edit {
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.danger {
		margin-left: auto;
		color: var(--danger, #b42318);
	}

	.danger:disabled {
		opacity: 0.45;
	}
</style>
