<script lang="ts">
	import { enhance } from '$app/forms';
	import { config } from '#lib/config/index.ts';
	import { dateFormat, formatDay } from '#lib/events/format.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import Crumbs from '#lib/components/Crumbs.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const replying = new FormState();
	const closing = new FormState();
	const leitung = $derived(data.role === 'leitung');

	const when = (message: (typeof data.messages)[number]) =>
		message.withTime
			? dateFormat(config.locale, { timeZone: config.timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(message.when))
			: formatDay(message.when, config.locale);
</script>

<Title title={data.thread.subject} />
<Crumbs items={[data.back ?? { href: leitung ? '/kummerkasten?ansicht=eingang' : '/kummerkasten?ansicht=meine', label: t.kummer.title }]} />

<header class="head">
	<h1>{data.thread.subject}</h1>
	<p class="meta">
		{#if leitung}
			<span class="who" class:named={!!data.thread.from}>
				<Icon name={data.thread.from ? 'user' : 'shield'} size={14} />{data.thread.from ? t.kummer.named(data.thread.from) : t.kummer.anonymous}
			</span>
			·
		{/if}
		{data.thread.to}
		{#if data.thread.closed}<span class="chip">{t.kummer.closed}</span>{/if}
	</p>
</header>

{#if data.sent}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.kummer.sent}</p>{/if}
{#if !leitung && data.thread.closed}<p class="msg info">{t.kummer.closedNote}</p>{/if}

<ol class="messages">
	{#each data.messages as message (message.id)}
		<li class="message" class:mine={message.mine} class:writer={message.fromAuthor}>
			<div class="bubble">
				<p class="from">
					{#if message.fromAuthor && leitung && !data.thread.from}<Icon name="shield" size={12} />{/if}
					<strong>{message.who}</strong>
					<span>{when(message)}</span>
				</p>
				<p class="body">{message.body}</p>
			</div>
		</li>
	{/each}
</ol>

<section class="ui-card reply">
	<form method="POST" action="?/reply" use:enhance={replying.submit({ reset: true })}>
		<label class="field">
			{t.kummer.reply}
			<textarea name="body" rows="4" maxlength="5000" required></textarea>
		</label>
		<small class="hint">{leitung ? t.kummer.replyHint : t.kummer.replyAuthorHint}</small>
		{#if form?.error}<p class="msg error" role="alert">{form.error}</p>{/if}
		{#if form && 'replied' in form}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.kummer.replied}</p>{/if}
		<div class="actions">
			<button class="btn" disabled={replying.busy}><Icon name="mail" size={16} />{t.kummer.replySend}</button>
		</div>
	</form>
	{#if leitung}
		<form method="POST" action="?/close" class="close" use:enhance={closing.submit()}>
			<input type="hidden" name="closed" value={data.thread.closed ? 'false' : 'true'} />
			<button class="btn ghost" disabled={closing.busy}>
				<Icon name={data.thread.closed ? 'refresh' : 'check'} size={16} />{data.thread.closed ? t.kummer.reopen : t.kummer.close}
			</button>
		</form>
	{/if}
</section>

<style>
	.head {
		margin-bottom: var(--space-5);
	}

	.head h1 {
		overflow-wrap: anywhere;
		font-size: var(--text-2xl, 1.75rem);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.who {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-weight: 600;
	}

	.chip {
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.messages {
		display: grid;
		gap: var(--space-3);
		margin: 0 0 var(--space-5);
		padding: 0;
		list-style: none;
	}

	.message {
		display: flex;
	}

	.message.mine {
		justify-content: flex-end;
	}

	.bubble {
		max-width: min(100%, 620px);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: 16px 16px 16px 4px;
		background: var(--surface);
	}

	.mine .bubble {
		border-color: color-mix(in oklab, var(--accent) 30%, var(--border));
		border-radius: 16px 16px 4px 16px;
		background: color-mix(in oklab, var(--accent) 9%, var(--surface));
	}

	.from {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		margin-bottom: var(--space-1);
		font-size: var(--text-xs);
	}

	.from span {
		color: var(--text-muted);
	}

	.body {
		overflow-wrap: anywhere;
		white-space: pre-wrap;
		line-height: 1.55;
	}

	.reply {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
	}

	.reply form {
		display: grid;
		gap: var(--space-2);
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.actions {
		margin-top: var(--space-2);
	}

	.close {
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}

	textarea {
		resize: vertical;
	}
</style>
