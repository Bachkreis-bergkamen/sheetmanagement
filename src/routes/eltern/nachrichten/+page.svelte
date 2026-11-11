<script lang="ts">
	import { enhance } from '$app/forms';
	import { config } from '#lib/config/index.ts';
	import { formatDay } from '#lib/events/format.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const sending = new FormState();
	const values = $derived(form && 'values' in form ? form.values : undefined);
</script>

<Title title={t.parents.messages.title} />
<PageHeader title={t.parents.messages.title} lead={t.parents.messages.lead} />

{#if data.state === 'not-set-up'}
	<p class="msg info">{t.kummer.notSetUp}</p>
{:else}
	{#if data.sent}<p class="msg ok sent" role="status"><Icon name="check" size={16} />{t.parents.messages.sent}</p>{/if}

	<section class="block" aria-labelledby="mine">
		<h2 class="ui-label" id="mine">{t.parents.messages.yours}</h2>
		{#if !data.threads.length}
			<p class="msg info">{t.parents.messages.empty}</p>
		{:else}
			<ul class="ui-list threads">
				{#each data.threads as thread (thread.id)}
					<li>
						<a href="/kummerkasten/{thread.id}">
							<span class="dot" class:on={thread.unread && !thread.closed} aria-hidden="true"></span>
							<span class="text">
								<strong>{thread.subject}</strong>
								<small>{formatDay(thread.day, config.locale)}</small>
							</span>
							{#if thread.unread && !thread.closed}<span class="chip new">{t.kummer.unread}</span>{/if}
							<span class="chip" class:ok={thread.answered}>{thread.closed ? t.kummer.closed : thread.answered ? t.kummer.answered : t.kummer.waiting}</span>
							<Icon name="chevron" size={16} />
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="ui-card block" aria-labelledby="new">
		<h2 id="new">{t.parents.messages.newMessage}</h2>
		{#if !data.leitung}
			<p class="msg info">{t.parents.messages.noLeitung}</p>
		{:else}
			<form method="POST" action="?/send" use:enhance={sending.submit()}>
				<p class="meta"><Icon name="user" size={14} />{t.parents.messages.signedAs(data.from)}</p>
				<label class="field">
					{t.kummer.subject}
					<input name="subject" maxlength="120" required autocomplete="off" value={values?.subject ?? ''} />
				</label>
				<label class="field">
					{t.kummer.body}
					<textarea name="body" rows="6" maxlength="5000" required value={values?.body ?? ''}></textarea>
				</label>
				{#if form?.error}<p class="msg error" role="alert">{form.error}</p>{/if}
				<div><button class="btn" disabled={sending.busy}><Icon name="mail" size={16} />{t.kummer.send}</button></div>
			</form>
		{/if}
	</section>
{/if}

<style>
	.block {
		margin-bottom: var(--space-6);
	}

	.sent {
		margin-bottom: var(--space-5);
	}

	h2#new {
		margin: 0 0 var(--space-4);
		font-size: var(--text-lg);
	}

	form {
		display: grid;
		gap: var(--space-4);
	}

	.meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.threads a {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--tap);
		padding: var(--space-3) var(--space-4);
		color: inherit;
		text-decoration: none;
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

	.text {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	.text small {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.chip {
		padding: 2px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-xs);
		white-space: nowrap;
	}

	.chip.ok {
		background: color-mix(in oklab, var(--ok) 15%, transparent);
		color: var(--text);
	}

	.chip.new {
		background: var(--accent);
		color: var(--accent-contrast);
	}
</style>
