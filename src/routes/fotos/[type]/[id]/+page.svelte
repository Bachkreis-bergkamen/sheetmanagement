<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import { CAPTION_MAX, clockText, COMMENT_MAX, PHOTOS_PER_UPLOAD, TITLE_MAX } from '#lib/album/album.ts';
	import { preparePhoto, type PreparedPhoto } from '#lib/album/resize.ts';
	import { FormState, showToast } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Crumbs from '#lib/components/Crumbs.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';
	import YoutubePlayer from '#lib/components/YoutubePlayer.svelte';

	let { data, form } = $props();
	const uploading = new FormState();
	const commenting = new FormState();
	const removing = new FormState();
	const moderating = new FormState();
	const suggesting = new FormState();
	const u = t.album.upload;
	const v = t.album.video;
	/** Per recording, the piece it plays from: a tap on a piece starts the player there. */
	let jump = $state<Record<string, number | undefined>>({});
	/** After a refused recording, the form keeps what was entered. */
	const entered = $derived(form && 'video' in form ? (form.video as Record<string, string>) : undefined);

	const photos = $derived(data.state === 'ready' ? data.photos : []);
	const image = (id: string, size: 'klein' | 'gross') => `/api/fotos/${id}/${size}`;

	// The lightbox: one photo large, with the ones before and after a tap or an arrow key away.
	let dialog = $state<HTMLDialogElement>();
	let current = $state(0);
	const shown = $derived(photos[current]);
	function open(index: number) {
		current = index;
		dialog?.showModal();
	}
	const step = (by: number) => (current = (current + by + photos.length) % photos.length);
	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') step(1);
		if (event.key === 'ArrowLeft') step(-1);
	}
	// A photo taken away while it's open: the next one, or none.
	$effect(() => {
		if (current >= photos.length) current = Math.max(0, photos.length - 1);
		if (!photos.length) dialog?.close();
	});

	// Upload: the chosen photos made smaller on the device first (resize.ts), with a preview each.
	let prepared = $state<PreparedPhoto[]>([]);
	let preparing = $state(false);
	let picker = $state<HTMLInputElement>();
	async function choose(event: Event) {
		const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
		if (!files.length) return;
		preparing = true;
		const room = PHOTOS_PER_UPLOAD - prepared.length;
		if (files.length > room) showToast(t.album.problems.tooMany(PHOTOS_PER_UPLOAD));
		for (const file of files.slice(0, Math.max(0, room))) {
			try {
				prepared.push(await preparePhoto(file));
			} catch {
				showToast(u.unreadable(file.name));
			}
		}
		preparing = false;
		if (picker) picker.value = '';
	}
	function clear() {
		for (const photo of prepared) URL.revokeObjectURL(photo.preview);
		prepared = [];
	}
	onDestroy(clear);
	/** Names the chosen photos in the form, so the same photos sent again keep their request id and new ones get another. */
	const signature = $derived(prepared.map((photo) => `${photo.name}:${photo.full.size}`).join('|'));
	const send = $derived(
		uploading.submit({
			onStart: ({ formData }) => {
				for (const photo of prepared) {
					formData.append('photo', new File([photo.full], 'foto.jpg', { type: photo.full.type }));
					formData.append('thumb', new File([photo.thumb], 'klein.jpg', { type: photo.thumb.type }));
					formData.append('size', `${photo.width},${photo.height}`);
				}
			},
			onSuccess: clear
		})
	);
</script>

{#if data.state === 'not-set-up'}
	<Title title={t.album.title} />
	<Crumbs items={[{ href: '/fotos', label: t.album.title }]} />
	<p class="msg info">{t.album.notSetUp}</p>
{:else}
	<Title title={data.album.title} />
	<Crumbs items={[{ href: '/fotos', label: t.album.title }]} />

	<header class="head">
		<span class="kind">{t.album.kind[data.album.kind]}{data.album.when ? ` · ${data.album.when}` : ''}</span>
		<h1>{data.album.title}</h1>
		{#if data.album.back}
			<a class="back" href={data.album.back}><Icon name="back" size={14} />{data.album.type === 'fahrt' ? t.album.page.toTrip : t.album.page.toEvent}</a>
		{/if}
	</header>

	{#if form?.message}<p class="msg error" role="alert">{form.message}</p>{/if}
	{#if form && 'uploaded' in form}
		<p class="msg ok" role="status"><Icon name="check" size={16} />{form.approved ? u.sentApproved(Number(form.uploaded)) : u.sent(Number(form.uploaded))}</p>
	{/if}
	{#if form && 'removed' in form}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.album.page.removed}</p>{/if}
	{#if form && 'videoAdded' in form}<p class="msg ok" role="status"><Icon name="check" size={16} />{form.approved ? v.sentApproved : v.sent}</p>{/if}
	{#if form && 'videoRemoved' in form}<p class="msg ok" role="status"><Icon name="check" size={16} />{v.removed}</p>{/if}

	{#if photos.length}
		<ul class="grid">
			{#each photos as photo, i (photo.id)}
				<li class:pending={photo.pending}>
					<button type="button" class="thumb" onclick={() => open(i)} aria-label={t.album.page.open(i + 1, photos.length)}>
						<img src={image(photo.id, 'klein')} alt={photo.caption ?? ''} width={photo.width} height={photo.height} loading="lazy" decoding="async" />
					</button>
					{#if photo.pending}<span class="badge"><Icon name="clock" size={12} />{t.album.page.pending}</span>
					{:else if photo.public && data.approves}<span class="badge public"><Icon name="globe" size={12} />{t.album.page.public}</span>{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="msg info">{t.album.page.noPhotos}</p>
	{/if}

	<!-- Recordings (#408): unlisted YouTube videos, played only after a tap. -->
	{#if data.videos.length || data.album.open}
		<section class="videos">
			<h2>{v.title}</h2>
			<p class="muted">{v.lead}</p>
			{#each data.videos as video (video.id)}
				<article class="video" id="aufnahme-{video.id}">
					<header>
						<strong>{video.title}</strong>
						<span class="muted">{v.by(video.by)}{video.pending ? ` · ${t.album.page.pending}` : ''}</span>
					</header>
					{#key jump[video.id]}
						<YoutubePlayer youtube={video.youtube} start={jump[video.id] ?? video.start} title={video.title} />
					{/key}
					{#if video.pieces.length}
						<ul class="chapters">
							{#each video.pieces as piece (piece.pieceId)}
								<li>
									<button type="button" class="chapter" class:on={jump[video.id] === (piece.start ?? 0)} onclick={() => (jump[video.id] = piece.start ?? 0)}>
										<span class="time">{clockText(piece.start ?? 0)}</span>{piece.title}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if video.pending && data.approves}
						<form method="POST" action="/fotos/freigabe?/approveVideo" use:enhance={moderating.submit({ stay: true })}>
							<input type="hidden" name="id" value={video.id} />
							<button class="btn small secondary" disabled={moderating.busy}><Icon name="check" size={16} />{t.album.approval.approve}</button>
						</form>
					{/if}
					{#if video.mayRemove}
						<form method="POST" action="?/removeVideo" use:enhance={removing.submit()} onsubmit={(event) => confirm(v.removeConfirm) || event.preventDefault()}>
							<input type="hidden" name="id" value={video.id} />
							<button class="link" disabled={removing.busy}>{v.remove}</button>
						</form>
					{/if}
				</article>
			{:else}
				<p class="muted">{v.none}</p>
			{/each}
			{#if data.album.open}
				<details class="ui-card add-video" open={!!entered}>
					<summary><Icon name="plus" size={16} />{v.add}</summary>
					<form method="POST" action="?/addVideo" use:enhance={suggesting.submit({ reset: true })}>
						<label class="field">
							<span>{v.link}</span>
							<input name="link" type="url" required inputmode="url" placeholder="https://youtu.be/…" value={entered?.link ?? ''} />
							<span class="muted">{v.linkHint}</span>
						</label>
						<label class="field">
							<span>{v.name}</span>
							<input name="title" required maxlength={TITLE_MAX} placeholder={v.nameHint} value={entered?.title ?? ''} />
						</label>
						{#if data.pieces.length}
							<fieldset class="field">
								<legend>{v.pieces}</legend>
								<span class="muted">{v.piecesHint}</span>
								{#each data.pieces as piece (piece.pieceId)}
									<label class="piece">
										<span>{piece.title}</span>
										<input name="start-{piece.pieceId}" inputmode="numeric" placeholder="12:30" size="8" value={entered?.[`start-${piece.pieceId}`] ?? ''} />
									</label>
								{/each}
							</fieldset>
						{/if}
						<div><button class="btn secondary" disabled={suggesting.busy}><Icon name="check" size={16} />{data.approves ? v.save : v.suggest}</button></div>
					</form>
				</details>
			{/if}
		</section>
	{/if}

	{#if data.album.open}
		<section class="ui-card upload" id="hochladen">
			<h2>{u.title}</h2>
			<p class="muted">{u.lead}{data.approves ? '' : ` ${u.leadPending}`}</p>
			<form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance={send}>
				<input type="hidden" name="files" value={signature} />
				<label class="btn secondary pick">
					<Icon name="camera" size={16} />{u.choose}
					<input bind:this={picker} type="file" accept="image/*" multiple onchange={choose} disabled={preparing || uploading.busy} />
				</label>
				{#if preparing}<p class="muted" role="status">{u.preparing}</p>{/if}
				{#if prepared.length}
					<ul class="previews" aria-label={u.ready(prepared.length)}>
						{#each prepared as photo (photo.preview)}<li><img src={photo.preview} alt={photo.name} /></li>{/each}
					</ul>
					<label class="field">
						<span>{u.caption} <span class="muted">({u.captionHint})</span></span>
						<input name="caption" maxlength={CAPTION_MAX} />
					</label>
					<div class="ui-actions">
						<button class="btn" disabled={uploading.busy || preparing}><Icon name="check" size={16} />{u.send(prepared.length)}</button>
						<button type="button" class="btn ghost" onclick={clear} disabled={uploading.busy}>{u.clear}</button>
					</div>
				{/if}
			</form>
		</section>
	{:else}
		<p class="msg info">{u.notOpen}</p>
	{/if}

	<section class="talk">
		<h2>{t.album.talk.title}</h2>
		{#if data.comments.length}
			<ul class="ui-list comments">
				{#each data.comments as comment (comment.id)}
					<li>
						<p class="who"><strong>{comment.name}</strong> <span class="muted">{comment.when}</span></p>
						<p class="text">{comment.text}</p>
						{#if comment.mayRemove}
							<form method="POST" action="?/removeComment" use:enhance={removing.submit()} onsubmit={(event) => confirm(t.album.talk.removeConfirm) || event.preventDefault()}>
								<input type="hidden" name="id" value={comment.id} />
								<button class="link" disabled={removing.busy}>{t.album.talk.remove}</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">{t.album.talk.none}</p>
		{/if}
		<form class="say" method="POST" action="?/comment" use:enhance={commenting.submit({ reset: true })}>
			<label class="field">
				<span>{t.album.talk.label}</span>
				<textarea name="text" rows="3" required maxlength={COMMENT_MAX} placeholder={t.album.talk.hint}>{form && 'text' in form ? String(form.text) : ''}</textarea>
			</label>
			<div><button class="btn secondary" disabled={commenting.busy}><Icon name="mail" size={16} />{t.album.talk.post}</button></div>
		</form>
	</section>

	<dialog bind:this={dialog} class="lightbox" {onkeydown} onclick={(event) => event.target === dialog && dialog?.close()} aria-label={shown?.caption ?? data.album.title}>
		{#if shown}
			<figure>
				<img src={image(shown.id, 'gross')} alt={shown.caption ?? ''} width={shown.width} height={shown.height} />
				<figcaption>
					{#if shown.caption}<span class="caption">{shown.caption}</span>{/if}
					<span class="muted">{t.album.page.by(shown.by)}{shown.pending ? ` · ${t.album.page.pending}` : ''}{shown.public ? ` · ${t.album.page.public}` : ''}</span>
				</figcaption>
			</figure>
			<div class="bar">
				{#if photos.length > 1}
					<button type="button" class="btn ghost" onclick={() => step(-1)} aria-label={t.album.page.previous}><Icon name="back" size={18} /></button>
					<button type="button" class="btn ghost" onclick={() => step(1)} aria-label={t.album.page.next}><Icon name="chevron" size={18} /></button>
				{/if}
				<a class="btn ghost" href={image(shown.id, 'gross')} target="_blank" rel="noopener">{t.album.page.download}</a>
				{#if data.approves}
					<form method="POST" action="/fotos/freigabe?/approve" use:enhance={moderating.submit({ stay: true })}>
						<input type="hidden" name="id" value={shown.id} />
						{#if shown.pending}
							<button class="btn ghost" disabled={moderating.busy}><Icon name="check" size={16} />{t.album.approval.approve}</button>
						{:else}
							<input type="hidden" name="public" value={shown.public ? '' : '1'} />
							<button class="btn ghost" disabled={moderating.busy}><Icon name="globe" size={16} />{shown.public ? t.album.approval.makePrivate : t.album.approval.makePublic}</button>
						{/if}
					</form>
				{/if}
				{#if shown.mayRemove}
					<form method="POST" action="?/removePhoto" use:enhance={removing.submit()} onsubmit={(event) => confirm(t.album.page.removeConfirm) || event.preventDefault()}>
						<input type="hidden" name="id" value={shown.id} />
						<button class="btn ghost" disabled={removing.busy}><Icon name="trash" size={16} />{t.album.page.remove}</button>
					</form>
				{/if}
				<button type="button" class="btn ghost close" onclick={() => dialog?.close()} aria-label={t.album.page.close}><Icon name="x" size={18} /></button>
			</div>
		{/if}
	</dialog>
{/if}

<style>
	.head {
		display: grid;
		gap: var(--space-1);
		margin-bottom: var(--space-5);
	}

	.kind,
	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		width: fit-content;
		font-size: var(--text-sm);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(46%, 160px), 1fr));
		gap: var(--space-2);
		margin: 0 0 var(--space-6);
		padding: 0;
		list-style: none;
	}

	.grid li {
		position: relative;
	}

	.thumb {
		display: block;
		width: 100%;
		padding: 0;
		overflow: hidden;
		aspect-ratio: 1;
		border: 0;
		border-radius: var(--radius-control);
		background: var(--hairline);
		cursor: zoom-in;
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform var(--fast) var(--ease);
	}

	.thumb:hover img {
		transform: scale(1.03);
	}

	.pending .thumb img {
		opacity: 0.6;
	}

	.badge {
		position: absolute;
		left: var(--space-1);
		bottom: var(--space-1);
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		border-radius: 999px;
		background: color-mix(in oklab, var(--surface) 90%, transparent);
		color: var(--text);
		font-size: var(--text-xs, 0.75rem);
		font-weight: 600;
	}

	.upload {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-6);
	}

	.upload form {
		display: grid;
		gap: var(--space-3);
	}

	/* The file input itself stays out of sight; its label is the button. */
	.pick {
		position: relative;
		width: fit-content;
		cursor: pointer;
	}

	.pick input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.pick:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.previews {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.previews img {
		width: 64px;
		height: 64px;
		border-radius: 6px;
		object-fit: cover;
	}

	.field {
		display: grid;
		gap: var(--space-1);
	}

	.talk,
	.videos {
		display: grid;
		gap: var(--space-3);
	}

	.videos {
		margin-bottom: var(--space-6);
	}

	.video {
		display: grid;
		gap: var(--space-2);
		max-width: 720px;
	}

	.video header {
		display: grid;
	}

	.chapters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.chapter {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.chapter.on {
		border-color: var(--accent);
		background: color-mix(in oklab, var(--accent) 10%, var(--surface));
	}

	.time {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.add-video summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 600;
		cursor: pointer;
	}

	.add-video form {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-3);
	}

	fieldset.field {
		margin: 0;
		padding: 0;
		border: 0;
	}

	.piece {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.comments li {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-3) 0;
	}

	.who,
	.text {
		margin: 0;
	}

	.text {
		white-space: pre-line;
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-sm);
		text-decoration: underline;
		cursor: pointer;
	}

	.say {
		display: grid;
		gap: var(--space-2);
	}

	.lightbox {
		width: min(100vw - 2 * var(--space-3), 1200px);
		max-width: none;
		max-height: calc(100dvh - 2 * var(--space-3));
		padding: var(--space-3);
		border: 0;
		border-radius: var(--radius-l);
		background: var(--surface);
		color: var(--text);
	}

	.lightbox::backdrop {
		background: rgb(0 0 0 / 0.8);
	}

	figure {
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}

	figure img {
		width: 100%;
		height: auto;
		max-height: calc(100dvh - 200px);
		object-fit: contain;
		border-radius: var(--radius-control);
	}

	figcaption {
		display: grid;
		gap: 2px;
	}

	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}

	.bar form {
		display: contents;
	}

	.close {
		margin-left: auto;
	}
</style>
