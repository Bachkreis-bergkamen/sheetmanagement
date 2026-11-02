<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import { t } from '#lib/i18n/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import InstrumentGlyph from '#lib/components/InstrumentGlyph.svelte';
	import InstrumentPicker from '#lib/components/InstrumentPicker.svelte';
	import { glyphOf } from '#lib/music/instrument-glyph.ts';
	import MyPartsConcert from '#lib/components/MyPartsConcert.svelte';
	import OfflineShelf from '#lib/components/OfflineShelf.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';
	import { config } from '#lib/config/index.ts';
	import { formatDay } from '#lib/events/format.ts';

	let { data, form } = $props();
	let picking = $state(false);
	const showPicker = $derived(picking || !data.choices.length);

	/** Concerts are added as you scroll; the one the page starts at is always among them. */
	const STEP = 2;
	const focusIndex = $derived(Math.max(0, data.concerts.findIndex((concert) => concert.id === data.focus)));
	let extra = $state(0);
	const count = $derived(Math.min(data.concerts.length, focusIndex + STEP + extra));
	const shown = $derived(data.concerts.slice(0, count));

	/** Adds the next concerts when the end of the list comes into view. */
	function more(sentinel: HTMLElement) {
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) extra += STEP;
		}, { rootMargin: '400px' });
		observer.observe(sentinel);
		return { destroy: () => observer.disconnect() };
	}

	async function scrollTo(id: string) {
		const index = data.concerts.findIndex((concert) => concert.id === id);
		if (index >= count) extra += index - count + 1;
		await tick();
		document.getElementById(`konzert-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function jump(event: SubmitEvent) {
		event.preventDefault();
		const id = new FormData(event.currentTarget as HTMLFormElement).get('konzert');
		if (typeof id === 'string') scrollTo(id);
	}

	// Opened for one concert ("Meine Noten fürs Herbstkonzert"): start there.
	$effect(() => {
		if (data.focus && focusIndex > 0) scrollTo(data.focus);
	});
</script>

<Title title={t.myParts.title} />
<PageHeader title={t.myParts.title} lead={t.myParts.lead} />

{#if data.status === 'pausiert' || data.status === 'inaktiv'}
	<p class="msg info status">
		{data.status === 'pausiert' ? t.myParts.paused(data.pausedUntil && formatDay(data.pausedUntil, config.locale)) : t.myParts.inactive}
		<a href="/profil">{t.myParts.profileHint}</a>
	</p>
{/if}

<div class="controls" data-tour="instrument">
	{#if showPicker}
		<form
			class="picker"
			method="POST"
			action="?/save"
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
					picking = false;
				}}
		>
			<p class="muted wide">
				{data.unknown ? t.myParts.unknownInstrument(data.unknown) : t.myParts.pickInstruments}
			</p>
			<div class="wide">
				{#key data.label}
					<InstrumentPicker choices={data.choices} instruments={data.instruments} common={data.common} required />
				{/key}
			</div>
			<button class="btn">{t.myParts.save}</button>
			{#if data.choices.length}<button class="btn ghost" type="button" onclick={() => (picking = false)}>{t.reports.cancel}</button>{/if}
		</form>
	{:else}
		<div class="chip">
			{#if data.choices[0]}<InstrumentGlyph glyph={glyphOf(data.choices[0].instrument)} size={20} />{:else}<Icon name="user" size={16} />{/if}
			<strong>{data.label}</strong>
			<button class="link" onclick={() => (picking = true)}>{t.myParts.change}</button>
			{#if form?.saved}<span class="muted">· {t.myParts.saved}</span>{/if}
		</div>
	{/if}

	{#if data.concerts.length > 1}
		<!-- Jumps to a concert in the list below; without JavaScript it reloads with that one on top. -->
		<form class="concert-picker" method="GET" onsubmit={jump}>
			<label class="field">
				{t.myParts.jumpTo}
				<select name="konzert" value={data.focus} onchange={(event) => event.currentTarget.form?.requestSubmit()}>
					{#each data.concerts as concert (concert.id)}
						<option value={concert.id}>{concert.title}{concert.jump ? ` · ${concert.jump}` : ''}</option>
					{/each}
				</select>
			</label>
			<noscript><button class="btn ghost small">{t.myParts.show}</button></noscript>
		</form>
	{/if}
</div>

<OfflineShelf offline={data.features.offline} />

{#if !data.concerts.length}
	<p class="msg info">{t.myParts.noConcert}</p>
{:else}
	<div class="concerts">
		{#each shown as concert (concert.id)}
			<MyPartsConcert {concert} label={data.label} canMerge={data.canMerge} />
		{/each}
	</div>
	{#if count < data.concerts.length}
		<div class="more" use:more>
			<button class="btn ghost" onclick={() => (extra += STEP)}>{t.myParts.more(data.concerts.length - count)}</button>
		</div>
	{/if}
{/if}

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}

	.picker {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3);
		padding: var(--space-5);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.picker .wide {
		flex-basis: 100%;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--tap);
		padding: 0 var(--space-4);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.link {
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		font-size: var(--text-sm);
		text-decoration: underline;
		cursor: pointer;
	}

	.concert-picker select {
		max-width: 320px;
	}

	.msg {
		margin-bottom: var(--space-4);
	}

	.status {
		flex-wrap: wrap;
	}

	.status a {
		color: var(--accent);
		font-weight: 600;
	}

	.muted {
		color: var(--text-muted);
		font-weight: 400;
	}

	.small {
		font-size: var(--text-xs);
	}

	.concerts {
		display: grid;
		gap: var(--space-7);
	}

	@media (max-width: 560px) {
		.concert-picker,
		.concert-picker select {
			width: 100%;
			max-width: none;
		}
	}

	.more {
		display: flex;
		justify-content: center;
		margin-top: var(--space-6);
	}
</style>
