<script lang="ts">
	import InstrumentGlyph from '#lib/components/InstrumentGlyph.svelte';
	import { glyphOf } from '#lib/music/instrument-glyph.ts';
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { guardUnsaved } from '#lib/unsaved.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import { searchText } from '#lib/music/text.ts';
	import Crumbs from '#lib/components/Crumbs.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const eventUrl = $derived(`/kalender/${encodeURIComponent(data.rehearsal.id)}`);

	// The page's working copy: who's ticked, by email.
	// svelte-ignore state_referenced_locally
	const start = data.state === 'ready' ? Object.fromEntries(data.people.map((person) => [person.email, person.present])) : {};
	let present = $state<Record<string, boolean>>({ ...start });
	let query = $state('');

	const people = $derived(data.state === 'ready' ? data.people : []);
	const shown = $derived.by(() => {
		const words = searchText(query).split(/\s+/).filter(Boolean);
		return words.length ? people.filter((person) => words.every((word) => searchText(person.name, person.section).includes(word))) : people;
	});
	/** By section, in the order the server sorted them. */
	const sections = $derived.by(() => {
		const groups: { label: string; people: typeof people }[] = [];
		for (const person of shown) {
			const label = person.section || t.signups.noInstrument;
			if (groups.at(-1)?.label !== label) groups.push({ label, people: [] });
			groups.at(-1)!.people.push(person);
		}
		return groups;
	});
	const count = $derived(people.filter((person) => present[person.email]).length);
	const changed = $derived(people.some((person) => present[person.email] !== start[person.email]));
	const payload = $derived(JSON.stringify(people.map((person) => ({ email: person.email, present: !!present[person.email] }))));

	const setAll = (pick: (person: (typeof people)[number]) => boolean) => {
		for (const person of people) present[person.email] = pick(person);
	};

	guardUnsaved(() => changed && !saving.busy);
</script>

<Title title={t.attendance.title} />

<Crumbs
	items={[
		{ href: '/kalender', label: t.concerts.title },
		...(data.concert ? [{ href: `/kalender/${encodeURIComponent(data.concert.id)}`, label: data.concert.title }] : []),
		{ href: eventUrl, label: data.rehearsal.title }
	]}
/>

<header class="head">
	<h1>{t.attendance.pageTitle(data.rehearsal.title)}</h1>
	<p class="muted">{data.rehearsal.date.long}{data.rehearsal.date.time ? ` · ${data.rehearsal.date.time}` : ''}</p>
</header>

{#if data.state === 'not-a-rehearsal'}
	<p class="msg info">{t.attendance.notARehearsal}</p>
{:else if data.state === 'not-yet'}
	<p class="msg info">{t.attendance.notYet}</p>
{:else if data.state === 'not-set-up'}
	<p class="msg info">{t.attendance.notSetUp}</p>
{:else if !people.length}
	<p class="msg info">{t.attendance.nobody}</p>
{:else}
	<p class="lead">{t.attendance.lead}</p>
	{#if form?.message}<p class="msg error" role="alert">{form.message}</p>{/if}

	<div class="tools">
		<label class="search">
			<Icon name="search" size={16} />
			<input bind:value={query} type="search" placeholder={t.attendance.search} aria-label={t.attendance.search} autocomplete="off" />
		</label>
		<div class="ui-actions">
			<button type="button" onclick={() => setAll((person) => person.answer === 'yes')}>{t.attendance.allYes}</button>
			<button type="button" onclick={() => setAll(() => false)}>{t.attendance.none}</button>
		</div>
	</div>

	{#each sections as section (section.label)}
		<section class="section">
			<h2 class="ui-label"><InstrumentGlyph glyph={glyphOf(section.label)} size={18} />{section.label}</h2>
			<ul class="ui-list">
				{#each section.people as person (person.email)}
					<li>
						<label class="person" class:on={present[person.email]}>
							<input type="checkbox" bind:checked={present[person.email]} />
							<span class="box" aria-hidden="true"><Icon name="check" size={16} /></span>
							<span class="name">{person.name}</span>
							{#if person.answer}<span class="answer {person.answer}">{t.attendance.answered[person.answer]}</span>{/if}
						</label>
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	<!-- Always in reach on a phone: the count and the save button. -->
	<form class="bar" method="POST" use:enhance={saving.submit()}>
		<input type="hidden" name="ticks" value={payload} />
		<input type="hidden" name="version" value={data.version} />
		<span class="count" aria-live="polite">{t.attendance.present(count, people.length)}</span>
		<a class="btn ghost" href={eventUrl}>{t.attendance.cancel}</a>
		<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{t.attendance.save}</button>
	</form>
{/if}

<style>
	.head {
		display: grid;
		gap: var(--space-1);
		margin-bottom: var(--space-4);
	}

	.muted,
	.lead {
		color: var(--text-muted);
	}

	.lead {
		margin-bottom: var(--space-4);
	}

	.msg {
		margin-bottom: var(--space-4);
	}

	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.search {
		display: flex;
		flex: 1;
		align-items: center;
		gap: var(--space-2);
		min-width: min(100%, 220px);
		height: 44px;
		padding: 0 var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text-muted);
	}

	.search:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 4px var(--accent-soft);
	}

	.search input {
		flex: 1;
		min-width: 0;
		height: 100%;
		border: 0;
		outline: 0;
		background: none;
		color: var(--text);
		font: inherit;
	}

	.section {
		margin-bottom: var(--space-5);
	}

	.person {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 52px;
		padding: var(--space-2) var(--space-4);
		cursor: pointer;
		transition: background var(--fast) var(--ease);
	}

	.person:hover {
		background: var(--surface-2);
	}

	.person input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.box {
		display: grid;
		flex: none;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 2px solid var(--border);
		border-radius: var(--radius-s);
		color: transparent;
		transition:
			background var(--fast) var(--ease),
			border-color var(--fast) var(--ease);
	}

	.person.on .box {
		border-color: var(--ok);
		background: var(--ok);
		color: var(--bg);
	}

	.person input:focus-visible + .box {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.name {
		flex: 1;
		min-width: 0;
		font-weight: 500;
		overflow-wrap: anywhere;
	}

	.answer {
		flex: none;
		padding: 1px 8px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.answer.yes {
		background: color-mix(in oklab, var(--ok) 14%, transparent);
		color: var(--ok);
	}

	.answer.no {
		background: color-mix(in oklab, var(--danger) 10%, transparent);
		color: var(--danger);
	}

	.bar {
		position: sticky;
		bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
		z-index: 5;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-5);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: color-mix(in oklab, var(--surface) 92%, transparent);
		box-shadow: var(--shadow-raised);
		backdrop-filter: blur(12px);
	}

	.count {
		flex: 1;
		font-weight: 600;
	}

	/* Above the phone's tab bar. */
	@media (max-width: 720px) {
		.bar {
			bottom: calc(var(--tabbar-height) + var(--space-2) + env(safe-area-inset-bottom));
		}
	}

	/* The section's instrument, drawn next to its name. */
	h2.ui-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
</style>
