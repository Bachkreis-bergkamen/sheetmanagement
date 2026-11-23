<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ALBUM_KINDS, type AlbumKind } from '#lib/album/album.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data } = $props();

	const kindOptions = [{ value: '' as AlbumKind | '', label: t.album.all }, ...ALBUM_KINDS.map((kind) => ({ value: kind as AlbumKind | '', label: t.album.kinds[kind] }))];
	const filtered = $derived(data.state === 'ready' ? data.filter : {});

	/** Changes one part of the filter in the address, keeping the other. */
	function refine(key: 'art' | 'jahr', value: string) {
		const params = new URLSearchParams(page.url.search);
		if (value) params.set(key, value);
		else params.delete(key);
		const query = params.toString();
		goto(query ? `?${query}` : page.url.pathname, { replace: true, reset: false });
	}

	const photo = (id: string) => `/api/fotos/${id}/klein`;
</script>

<Title title={t.album.title} />
<PageHeader title={t.album.title} lead={t.album.lead} />

{#if data.state === 'not-set-up'}
	<p class="msg info">{t.album.notSetUp}</p>
{:else}
	<!-- One primary button: here, or in the empty album below. -->
	{#if data.total}<p class="add"><a class="btn" href="/fotos/neu"><Icon name="plus" size={16} />{t.album.add}</a></p>{/if}
	{#if data.waiting}
		<a class="waiting" href="/fotos/freigabe"><Icon name="clock" size={16} />{t.album.waiting(data.waiting)}<Icon name="chevron" size={16} /></a>
	{/if}

	{#if data.total}
		<div class="filters">
			<Segmented options={kindOptions} value={filtered.kind ?? ''} label={t.album.filterKind} onchange={(value) => refine('art', value)} />
			{#if data.years.length > 1}
				<label class="year">
					<span class="ui-label">{t.album.filterYear}</span>
					<select value={filtered.year ?? ''} onchange={(event) => refine('jahr', event.currentTarget.value)}>
						<option value="">{t.album.allYears}</option>
						{#if data.decades.length}
							<optgroup label={t.album.decades}>
								{#each data.decades as decade (decade)}<option value={decade}>{decade}</option>{/each}
							</optgroup>
						{/if}
						<optgroup label={t.album.years}>
							{#each data.years as year (year)}<option value={year}>{year}</option>{/each}
						</optgroup>
					</select>
				</label>
			{/if}
		</div>
	{/if}

	{#if data.albums.length}
		<ul class="albums">
			{#each data.albums as album (album.album)}
				<li>
					<a class="album" href={album.href}>
						<span class="cover">
							{#if album.cover}
								<img src={photo(album.cover)} alt="" loading="lazy" decoding="async" />
							{:else}
								<span class="only-videos"><Icon name="music" size={32} /></span>
							{/if}
							{#if album.preview.length > 1}
								<span class="strip" aria-hidden="true">
									{#each album.preview.slice(1) as id (id)}<img src={photo(id)} alt="" loading="lazy" decoding="async" />{/each}
								</span>
							{/if}
						</span>
						<span class="body">
							<span class="kind">{t.album.kind[album.kind]}{album.when ? ` · ${album.when}` : ''}</span>
							<strong class="title">{album.title}</strong>
							<span class="muted">{[album.count ? t.album.photos(album.count) : '', album.videos ? t.album.videos(album.videos) : '', album.comments ? t.album.comments(album.comments) : ''].filter(Boolean).join(' · ')}</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="nothing">
			<Icon name="camera" size={28} />
			<p>{data.total ? t.album.emptyFiltered : t.album.empty}</p>
			{#if !data.total}<a class="btn" href="/fotos/neu"><Icon name="plus" size={16} />{t.album.add}</a>{/if}
		</div>
	{/if}
{/if}

<style>
	.add {
		margin: 0 0 var(--space-4);
	}

	.waiting {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border: 1px solid color-mix(in oklab, var(--accent) 35%, var(--hairline));
		border-radius: var(--radius-control);
		background: color-mix(in oklab, var(--accent) 8%, var(--surface));
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}

	.waiting :global(svg:last-child) {
		margin-left: auto;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}

	.year {
		display: grid;
		gap: var(--space-1);
	}

	.albums {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.album {
		display: grid;
		overflow: hidden;
		height: 100%;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
		transition: border-color var(--fast) var(--ease);
	}

	.album:hover {
		border-color: var(--border);
	}

	.cover {
		position: relative;
		display: block;
		aspect-ratio: 3 / 2;
		background: var(--surface-sunken, var(--hairline));
	}

	.cover > img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.only-videos {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, color-mix(in oklab, var(--accent) 70%, #000), #111);
		color: #fff;
	}

	/* The next photos as small squares over the cover's corner. */
	.strip {
		position: absolute;
		right: var(--space-2);
		bottom: var(--space-2);
		display: flex;
		gap: 4px;
	}

	.strip img {
		width: 40px;
		height: 40px;
		border: 2px solid var(--surface);
		border-radius: 6px;
		object-fit: cover;
	}

	.body {
		display: grid;
		gap: 2px;
		padding: var(--space-3) var(--space-4) var(--space-4);
	}

	.kind,
	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.title {
		font-size: var(--text-md);
	}

	.nothing {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		padding: var(--space-7) var(--space-5);
		border: 1px dashed var(--border);
		border-radius: var(--radius-l);
		color: var(--text-muted);
		text-align: center;
	}
</style>
