<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { config } from '#lib/config/index.ts';
	import { formatDay } from '#lib/events/format.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const sending = new FormState();
	type Tab = 'write' | 'mine' | 'inbox';

	// svelte-ignore state_referenced_locally
	let tab = $state<Tab>(data.state === 'ready' ? data.tab : 'write');
	const PARAM: Record<Tab, string | null> = { write: null, mine: 'meine', inbox: 'eingang' };
	function changeTab(next: Tab) {
		const url = new URL(page.url.href);
		if (PARAM[next]) url.searchParams.set('ansicht', PARAM[next]!);
		else url.searchParams.delete('ansicht');
		replaceState(url, {});
	}

	const values = $derived(form && 'values' in form ? form.values : undefined);
	// svelte-ignore state_referenced_locally
	let some = $state(!!values?.to?.length);
	const unreadMine = $derived(data.state === 'ready' ? data.mine.filter((thread) => thread.unread).length : 0);
	const unreadInbox = $derived(data.state === 'ready' ? data.inbox.filter((thread) => thread.unread && !thread.closed).length : 0);
	const day = (date: string) => formatDay(date, config.locale);
</script>

<Title title={t.kummer.title} />
<PageHeader title={t.kummer.title} lead={t.kummer.lead} />

{#if data.state === 'not-set-up'}
	<p class="msg info">{t.kummer.notSetUp}</p>
{:else}
	<div class="tabs">
		<Segmented
			label={t.kummer.title}
			options={[
				{ value: 'write', label: t.kummer.tabs.write, icon: 'edit' },
				{ value: 'mine', label: unreadMine ? `${t.kummer.tabs.mine} · ${unreadMine}` : t.kummer.tabs.mine, icon: 'mail' },
				...(data.reader ? [{ value: 'inbox' as const, label: unreadInbox ? `${t.kummer.tabs.inbox} · ${unreadInbox}` : t.kummer.tabs.inbox, icon: 'bell' as const }] : [])
			]}
			bind:value={tab}
			onchange={changeTab}
		/>
	</div>

	{#if tab === 'write'}
		<section class="ui-card write">
			<p class="privacy"><Icon name="shield" size={18} /><span>{t.kummer.privacy}</span></p>
			<form method="POST" action="?/send" use:enhance={sending.submit()}>
				<fieldset class="to">
					<legend>{t.kummer.to}</legend>
					{#if data.leitung.length}
						<label class="choice"><input type="radio" name="scope" checked={!some} onchange={() => (some = false)} />{t.kummer.toAll}</label>
						<label class="choice"><input type="radio" name="scope" checked={some} onchange={() => (some = true)} />{t.kummer.toSome}</label>
						{#if some}
							<div class="people">
								{#each data.leitung as person (person.email)}
									<label class="person">
										<input type="checkbox" name="to" value={person.email} checked={values?.to?.includes(person.email)} />
										<span class="person-text">
											<strong>{person.name}</strong>
											{#if person.roles.length}<small>{person.roles.join(', ')}</small>{/if}
										</span>
									</label>
								{/each}
							</div>
						{/if}
						<small class="hint">{t.kummer.toHint}</small>
					{:else}
						<p class="msg info">{t.kummer.noLeitung}</p>
					{/if}
				</fieldset>
				<label class="field">
					{t.kummer.subject}
					<input name="subject" maxlength="120" required autocomplete="off" placeholder={t.kummer.subjectHint} value={values?.subject ?? ''} />
				</label>
				<label class="field">
					{t.kummer.body}
					<textarea name="body" rows="7" maxlength="5000" required>{values?.body ?? ''}</textarea>
				</label>
				{#if data.myName}
					<label class="choice signed">
						<input type="checkbox" name="signed" checked={!!values?.signed} />
						<span>{t.kummer.signed(data.myName)}<small>{t.kummer.signedHint}</small></span>
					</label>
				{/if}
				{#if form?.error}<p class="msg error" role="alert">{form.error}</p>{/if}
				<div><button class="btn" disabled={sending.busy || !data.leitung.length}><Icon name="mail" size={16} />{t.kummer.send}</button></div>
			</form>
		</section>
	{:else}
		{@const threads = tab === 'mine' ? data.mine : data.inbox}
		{#if !threads.length}
			<p class="msg info">{tab === 'mine' ? t.kummer.empty : t.kummer.inboxEmpty}</p>
		{:else}
			<ul class="ui-list threads">
				{#each threads as thread (thread.id)}
					<li class:closed={thread.closed}>
						<a href="/kummerkasten/{thread.id}">
							<span class="dot" class:on={thread.unread && !thread.closed} aria-hidden="true"></span>
							<span class="thread-text">
								<strong>{thread.subject}</strong>
								<small>
									{'from' in thread ? (thread.from ? t.kummer.named(thread.from) : t.kummer.anonymous) : thread.to}
									· {day(thread.date)}
								</small>
							</span>
							<span class="status">
								{#if thread.unread && !thread.closed}<span class="chip new">{t.kummer.unread}</span>{/if}
								{#if thread.closed}
									<span class="chip">{t.kummer.closed}</span>
								{:else if thread.answered}
									<span class="chip ok">{t.kummer.answered}</span>
								{:else}
									<span class="chip">{t.kummer.waiting}</span>
								{/if}
							</span>
							<Icon name="chevron" size={16} />
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
{/if}

<style>
	.tabs {
		margin-bottom: var(--space-5);
	}

	.write {
		padding: var(--space-5);
	}

	.privacy {
		display: flex;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md, 12px);
		background: color-mix(in oklab, var(--accent) 8%, var(--surface));
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.privacy :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--accent);
	}

	form {
		display: grid;
		gap: var(--space-4);
	}

	.to {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.to legend {
		padding-bottom: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.choice {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 36px;
		cursor: pointer;
	}

	.choice input,
	.person input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}

	.signed {
		align-items: flex-start;
	}

	.signed input {
		margin-top: 2px;
	}

	.signed span,
	.person-text {
		display: grid;
		gap: 2px;
	}

	.signed small,
	.person-text small,
	.hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.people {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: var(--space-2);
		margin-left: var(--space-6);
	}

	.person {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		cursor: pointer;
	}

	.person:has(input:checked) {
		border-color: var(--accent);
		background: color-mix(in oklab, var(--accent) 8%, var(--surface));
	}

	textarea {
		resize: vertical;
	}

	.threads a {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		color: inherit;
		text-decoration: none;
	}

	.threads a:hover {
		background: var(--surface-2);
	}

	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.dot.on {
		background: var(--accent);
	}

	.thread-text {
		display: grid;
		flex: 1;
		gap: 2px;
		min-width: 0;
	}

	.thread-text strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.thread-text small {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.closed .thread-text strong {
		color: var(--text-muted);
		font-weight: 500;
	}

	.status {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-1);
	}

	.chip {
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
	}

	.chip.new {
		background: var(--accent);
		color: var(--on-accent, #fff);
	}

	.chip.ok {
		background: color-mix(in oklab, var(--ok, #2e7d32) 14%, transparent);
		color: var(--ok, #2e7d32);
	}

	@media (max-width: 560px) {
		.people {
			margin-left: 0;
		}

		.status .chip:not(.new) {
			display: none;
		}
	}
</style>
