<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { WISH_STATUSES, type WishKind } from '#lib/feedback/feedback.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	let adding = $state(false);

	// The tab is also in the URL (?art=funktion), so a link can point at feature requests.
	let kind: WishKind = $state(page.url.searchParams.get('art') === 'funktion' ? 'feature' : 'piece');
	const shown = $derived(data.wishes.filter((wish) => wish.kind === kind));
	const counts = $derived({
		piece: data.wishes.filter((wish) => wish.kind === 'piece').length,
		feature: data.wishes.filter((wish) => wish.kind === 'feature').length
	});
	const choose = (next: WishKind) => {
		adding = false;
		kind = next;
		goto(next === 'feature' ? '?art=funktion' : '?', { replace: true, shallow: true });
	};

	const confirmDelete = (title: string) => (event: SubmitEvent) => {
		if (!confirm(t.wishes.confirmDelete(title))) event.preventDefault();
	};

	const saving = new FormState();
	const submit = saving.submit({ reset: true, onSuccess: () => (adding = false) });
</script>

<Title title={t.wishes.title} />
<PageHeader title={t.wishes.title} lead={t.wishes.lead} />

{#if data.state === 'sign-in'}
	<p class="msg info">{t.wishes.signInNeeded}</p>
{:else if data.state === 'not-set-up'}
	<p class="msg info">{t.wishes.notSetUp}</p>
{:else}
	<div class="tabs" role="tablist">
		{#each ['piece', 'feature'] as const as tab (tab)}
			<button role="tab" class="tab" class:active={kind === tab} aria-selected={kind === tab} onclick={() => choose(tab)}>
				{t.wishes.tabs[tab]}
				<span class="count">{counts[tab]}</span>
			</button>
		{/each}
	</div>

	{#if form?.message}
		<p class="msg error" role="alert">{form.message}</p>
	{:else if form && 'added' in form}
		<p class="msg ok" role="status"><Icon name="check" size={16} />{t.wishes.thanks}</p>
	{/if}

	{#if adding}
		<form class="add ui-card" method="POST" action="?/add" use:enhance={submit}>
			<input type="hidden" name="kind" value={kind} />
			{#if kind === 'piece'}
				<label class="field">
					{t.wishes.titleLabel}
					<input name="title" required maxlength="200" autocomplete="off" list="archive-titles" placeholder={t.wishes.titleHint} />
				</label>
				<datalist id="archive-titles">
					{#each data.archive as title (title)}<option value={title}></option>{/each}
				</datalist>
				<label class="field">{t.wishes.composer}<input name="composer" maxlength="200" autocomplete="off" /></label>
				{#if data.concerts.length}
					<label class="field wide">
						{t.wishes.concert}
						<select name="concert">
							<option value="">{t.wishes.anyTime}</option>
							{#each data.concerts as concert (concert.title)}
								<option value={concert.title}>{concert.title}{concert.label ? ` · ${concert.label}` : ''}</option>
							{/each}
						</select>
					</label>
				{/if}
				<label class="field wide">
					{t.wishes.link}
					<input name="link" type="url" maxlength="500" placeholder={t.wishes.linkHint} autocomplete="off" />
				</label>
				<label class="field wide">{t.wishes.why}<textarea name="description" maxlength="2000"></textarea></label>
			{:else}
				<label class="field wide">{t.wishes.description}<textarea name="description" required maxlength="2000"></textarea></label>
			{/if}
			<label class="anonymous wide">
				<input type="checkbox" name="anonymous" />
				<span>{t.wishes.anonymousLabel} <span class="muted">{t.wishes.anonymousHint}</span></span>
			</label>
			<div class="actions">
				<button class="btn" disabled={saving.busy}><Icon name="plus" size={16} />{t.wishes.send}</button>
				<button class="btn ghost" type="button" onclick={() => (adding = false)}>{t.reports.cancel}</button>
			</div>
		</form>
	{:else}
		<button class="btn add-button" onclick={() => (adding = true)}><Icon name="plus" size={16} />{t.wishes.add[kind]}</button>
	{/if}

	{#if shown.length}
		<ul class="wishes ui-list">
			{#each shown as wish (wish.id)}
				<li class="wish" class:closed={wish.status === 'done' || wish.status === 'declined'}>
					<form class="vote" method="POST" action="?/vote" use:enhance={submit}>
						<input type="hidden" name="id" value={wish.id} />
						<button
							class="vote-button"
							class:voted={wish.voted}
							disabled={saving.busy}
							aria-pressed={wish.voted}
							title={wish.voted ? t.wishes.unvote : t.wishes.vote}
						>
							<Icon name="heart" size={18} />
							<span>{t.wishes.votes(wish.votes)}</span>
						</button>
					</form>
					<div class="body">
						<div class="head">
							<strong class="title">{wish.title}</strong>
							{#if wish.composer}<span class="muted">{wish.composer}</span>{/if}
							{#if wish.status !== 'open'}
								<span class="status {wish.status}">{t.feedbackValues.wishStatus[wish.status]}</span>
							{/if}
							{#if wish.concert}<span class="for-concert">{t.wishes.forConcert(wish.concert)}</span>{/if}
						</div>
						{#if wish.description && (wish.kind === 'piece' || wish.description !== wish.title)}
							<p class="description">{wish.description}</p>
						{/if}
						<div class="links">
							{#if wish.link}
								<a href={wish.link} target="_blank" rel="noopener noreferrer nofollow"><Icon name="external" size={14} />{wish.link.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>
							{/if}
							{#if wish.pieceId}
								<a href="/stuecke/{encodeURIComponent(wish.pieceId)}"><Icon name="music" size={14} />{t.wishes.toPiece}</a>
								{#if wish.pieceStatus && wish.pieceStatus !== 'ok'}<span class="piece-status">{t.pieces.status[wish.pieceStatus]}</span>{/if}
							{/if}
						</div>
						{#if wish.answer}<p class="answer"><strong>{t.wishes.answer}:</strong> {wish.answer}</p>{/if}
						<div class="meta">
							<p class="muted small" title={wish.submitterEmail}>
								{wish.submittedBy ? t.wishes.submittedBy(wish.submittedBy, wish.submittedAt) : wish.submittedAt}
							</p>
							{#if wish.canDelete}
								<form method="POST" action="?/delete" use:enhance={submit} onsubmit={confirmDelete(wish.title)}>
									<input type="hidden" name="id" value={wish.id} />
									<button class="delete" disabled={saving.busy} title={t.wishes.delete} aria-label={t.wishes.delete}>
										<Icon name="trash" size={16} />
									</button>
								</form>
							{/if}
						</div>
						{#if data.canManage}
							<!-- Folded, so the list reads like everyone else's; one tap opens the answer for this wish. -->
							<details class="manage">
								<summary>{t.wishes.manage}</summary>
								<form method="POST" action="?/status" use:enhance={submit}>
									<input type="hidden" name="id" value={wish.id} />
									<label class="field">
										{t.wishes.status}
										<select name="status" value={wish.status}>
											{#each WISH_STATUSES as status (status)}
												<option value={status}>{t.feedbackValues.wishStatus[status]}</option>
											{/each}
										</select>
									</label>
									<label class="field grow">
										{t.wishes.answer}
										<input name="answer" value={wish.answer} maxlength="1000" autocomplete="off" />
									</label>
									<button class="btn secondary small" disabled={saving.busy}>{t.wishes.setStatus}</button>
								</form>
							</details>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="msg info">{t.wishes.empty[kind]}</p>
	{/if}
{/if}

<style>
	.tabs {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		overflow-x: auto;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: 8px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: var(--text-md);
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.tab.active {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.count {
		padding: 0 6px;
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, currentColor 14%, transparent);
		font-size: var(--text-2xs);
	}

	.msg {
		margin-bottom: var(--space-4);
	}

	.add-button {
		margin-bottom: var(--space-4);
	}

	.anonymous {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		font-size: var(--text-md);
	}

	.anonymous input {
		margin-top: 4px;
		accent-color: var(--accent);
	}

	.add {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}

	.wide,
	.actions {
		grid-column: 1 / -1;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.wish {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-4);
	}

	.wish.closed .title {
		color: var(--text-muted);
	}

	.vote-button {
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 2px;
		width: 52px;
		min-height: 56px;
		padding: var(--space-2) 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 700;
		cursor: pointer;
		transition:
			background var(--fast) var(--ease),
			color var(--fast) var(--ease),
			transform var(--fast) var(--ease);
	}

	.vote-button:hover {
		background: var(--surface-2);
	}

	.vote-button:active {
		transform: scale(0.95);
	}

	.vote-button.voted {
		border-color: color-mix(in oklab, var(--accent) 45%, var(--border));
		background: var(--accent-soft);
		color: var(--accent);
	}

	.body {
		display: grid;
		gap: var(--space-1);
		flex: 1;
		min-width: 0;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
	}

	.title {
		overflow-wrap: anywhere;
	}

	.description,
	.answer {
		white-space: pre-line;
		overflow-wrap: anywhere;
	}

	.answer {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-m);
		background: var(--accent-soft);
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.links:empty {
		display: none;
	}

	.links a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.status {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 700;
	}

	.status.planned {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.status.done {
		background: color-mix(in oklab, var(--ok) 14%, transparent);
		color: var(--ok);
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}

	.small {
		font-size: var(--text-xs);
	}

	.for-concert {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.piece-status {
		color: var(--warn);
		font-size: var(--text-xs);
	}

	.meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.delete {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.delete:hover {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.manage {
		margin-top: var(--space-1);
		padding-top: var(--space-2);
		border-top: 1px solid var(--hairline);
	}

	.manage summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}

	.manage summary::-webkit-details-marker {
		display: none;
	}

	/* The drawn chevron the other disclosures use, turning down when open. */
	.manage summary::after {
		width: 6px;
		height: 6px;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		content: '';
		transform: rotate(-45deg);
		transition: transform var(--fast) var(--ease);
	}

	.manage[open] summary::after {
		transform: rotate(45deg);
	}

	.manage form {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.manage .grow {
		flex: 1;
		min-width: 160px;
	}
</style>
