<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Crumbs from '#lib/components/Crumbs.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const a = t.album.approval;
</script>

<Title title={a.title} />
<Crumbs items={[{ href: '/fotos', label: t.album.title }]} />
<PageHeader title={a.title} lead={a.lead} />

{#if data.state === 'not-set-up'}
	<p class="msg info">{t.album.notSetUp}</p>
{:else}
	{#if form?.message}<p class="msg error" role="alert">{form.message}</p>{/if}
	<div class="storage" title={a.storageHint}>
		<span>{a.storage(data.storage.used, data.storage.budget)}</span>
		<span class="meter" aria-hidden="true"><span class:high={data.storage.share > 0.85} style:width="{data.storage.share * 100}%"></span></span>
		<span class="muted">{a.storageHint}</span>
	</div>
	{#if data.albums.length}
		<p class="ui-hint hint"><Icon name="alert" size={14} /><span>{a.consentHint} <a href="/fotoerlaubnis">{t.nav.photos}</a></span></p>
		{#each data.albums as album (album.key)}
			<section class="album">
				<h2><a href={album.href}>{album.title}</a></h2>
				<p class="muted">{t.album.kind[album.kind]}{album.when ? ` · ${album.when}` : ''}</p>
				{#if album.notShown?.length}<p class="msg error consent"><Icon name="alert" size={16} />{a.notShown(album.notShown.join(', '))}</p>{/if}
				<ul class="photos">
					{#each album.photos as photo (photo.id)}
						<li class="ui-card">
							<a href="/api/fotos/{photo.id}/gross" target="_blank" rel="noopener"><img src="/api/fotos/{photo.id}/klein" alt={photo.caption ?? ''} loading="lazy" /></a>
							{#if photo.caption}<p class="caption">{photo.caption}</p>{/if}
							<p class="muted">{photo.by}</p>
							<form method="POST" action="?/approve" use:enhance={saving.submit()}>
								<input type="hidden" name="id" value={photo.id} />
								<label class="check"><input type="checkbox" name="public" value="1" />{a.approvePublic}</label>
								<div class="ui-actions">
									<button class="btn small secondary" disabled={saving.busy}><Icon name="check" size={16} />{a.approve}</button>
									<button class="btn small ghost" formaction="?/reject" disabled={saving.busy} onclick={(event) => confirm(a.rejectConfirm) || event.preventDefault()}>{a.reject}</button>
								</div>
							</form>
						</li>
					{/each}
				</ul>
				{#if album.videos.length}
					<h3 class="ui-label">{a.videos}</h3>
					<ul class="ui-list">
						{#each album.videos as video (video.id)}
							<li class="video">
								<a href={video.link} target="_blank" rel="noopener noreferrer nofollow"><strong>{video.title}</strong> <Icon name="external" size={14} /></a>
								{#if video.pieces.length}<span class="muted">{video.pieces.join(' · ')}</span>{/if}
								<span class="muted">{video.by}</span>
								<form method="POST" action="?/approveVideo" use:enhance={saving.submit()}>
									<input type="hidden" name="id" value={video.id} />
									<div class="ui-actions">
										<button class="btn small secondary" disabled={saving.busy}><Icon name="check" size={16} />{a.approve}</button>
										<button class="btn small ghost" formaction="?/rejectVideo" disabled={saving.busy}>{a.reject}</button>
									</div>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/each}
	{:else}
		<p class="msg ok"><Icon name="check" size={16} />{a.empty}</p>
	{/if}
{/if}

<style>
	.storage {
		display: grid;
		gap: var(--space-1);
		margin-bottom: var(--space-5);
		font-size: var(--text-sm);
	}

	.meter {
		display: block;
		height: 6px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--hairline);
	}

	.meter span {
		display: block;
		height: 100%;
		background: var(--accent);
	}

	.meter span.high {
		background: var(--danger, #b3261e);
	}

	.video {
		display: grid;
		gap: 2px;
		padding: var(--space-3) 0;
	}

	.hint {
		display: flex;
		gap: var(--space-2);
		align-items: baseline;
		margin: 0 0 var(--space-5);
	}

	.album {
		margin-bottom: var(--space-6);
	}

	.album h2 {
		margin-bottom: 0;
	}

	.muted {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.consent {
		margin-top: var(--space-3);
	}

	.photos {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
		gap: var(--space-3);
		margin: var(--space-3) 0 0;
		padding: 0;
		list-style: none;
	}

	.photos li {
		display: grid;
		gap: var(--space-2);
		align-content: start;
	}

	.photos img {
		width: 100%;
		aspect-ratio: 3 / 2;
		border-radius: var(--radius-control);
		object-fit: cover;
	}

	.caption {
		margin: 0;
	}

	form {
		display: grid;
		gap: var(--space-2);
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
	}
</style>
