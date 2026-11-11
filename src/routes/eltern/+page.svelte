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
	const saving = new FormState();
	const reserving = new FormState();

	/** The child and date whose "Entschuldigen" form is open, as "event|child". */
	let excusing = $state<string | null>(null);
	/** The concert whose ticket form is open. */
	let ticketsFor = $state<string | null>(null);
	const day = (date: string) => formatDay(date, config.locale);
</script>

<Title title={t.parents.title} />
<PageHeader title={t.parents.title} lead={t.parents.lead(data.name)} />

{#if !data.children.length}
	<p class="msg info">{t.parents.noChildren}</p>
{:else}
	<ul class="kids" aria-label={t.parents.children}>
		{#each data.children as child (child.email)}
			<li><Icon name="user" size={16} /><strong>{child.name}</strong>{#if child.orchestras.length}<span>{child.orchestras.join(', ')}</span>{/if}</li>
		{/each}
	</ul>
{/if}

{#if data.notices.length}
	<section class="block" aria-labelledby="notices">
		<h2 class="ui-label" id="notices">{t.parents.notices.shortTitle}</h2>
		<ul class="notices">
			{#each data.notices as notice (notice.id)}
				<li class="ui-card notice">
					<h3>{notice.title}</h3>
					<p class="body">{notice.body}</p>
					<p class="meta">{t.parents.notices.by(notice.byName, day(notice.day))}</p>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if data.children.length}
	<section class="block" aria-labelledby="dates">
		<h2 class="ui-label" id="dates">{t.parents.dates}</h2>
		{#if form?.answerError}<p class="msg error" role="alert">{form.answerError}</p>{/if}
		{#if !data.dates.length}
			<p class="msg info">{t.parents.noDates}</p>
		{:else}
			<ul class="ui-list dates">
				{#each data.dates as date (date.id)}
					<li class="date">
						<div class="when" aria-hidden="true">
							<span class="weekday">{date.date.weekday}</span>
							<span class="day">{date.date.day}</span>
							<span class="month">{date.date.month}</span>
						</div>
						<div class="what">
							<p class="kind">
								<span class="type type-{date.type}">{t.concerts.types[date.type]}</span>
								<span>{t.parents.inDays(date.daysUntil)}</span>
								{#if date.tentative}<span>· {t.concerts.tentative}</span>{/if}
							</p>
							<h3>{date.title}</h3>
							<p class="meta">{[date.date.long, date.date.time, date.location].filter(Boolean).join(' · ')}</p>

							{#if data.signups}
								<ul class="answers">
									{#each date.children as child (child.email)}
										{@const key = `${date.id}|${child.email}`}
										{@const done = form?.answered?.event === date.id && form.answered.child === child.email}
										<li>
											<span class="child">
												<strong>{child.name}</strong>
												<span class="state state-{child.answer ?? 'open'}">{t.parents.status[child.answer ?? 'open']}</span>
												{#if done}<span class="saved" role="status"><Icon name="check" size={14} />{t.parents.saved}</span>{/if}
											</span>
											{#if excusing === key}
												<form class="excuse" method="POST" action="?/answer" use:enhance={saving.submit({ onSuccess: () => (excusing = null) })}>
													<input type="hidden" name="event" value={date.id} />
													<input type="hidden" name="child" value={child.email} />
													<input type="hidden" name="answer" value="no" />
													<label class="field">
														{t.parents.reason}
														<input name="reason" maxlength="400" placeholder={t.parents.reasonHint} autocomplete="off" />
													</label>
													<div class="buttons">
														<button class="btn small" disabled={saving.busy}>{t.parents.excuseSend}</button>
														<button class="btn ghost small" type="button" onclick={() => (excusing = null)}>{t.parents.cancel}</button>
													</div>
												</form>
											{:else}
												<form class="buttons" method="POST" action="?/answer" use:enhance={saving.submit()}>
													<input type="hidden" name="event" value={date.id} />
													<input type="hidden" name="child" value={child.email} />
													<button class="btn small" class:ghost={child.answer !== 'yes'} name="answer" value="yes" disabled={saving.busy} aria-pressed={child.answer === 'yes'}>
														<Icon name="check" size={14} />{t.parents.comes}
													</button>
													<button class="btn ghost small" type="button" disabled={saving.busy} aria-pressed={child.answer === 'no'} onclick={() => (excusing = key)}>
														{t.parents.excuse}
													</button>
												</form>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}

							{#if date.tickets}
								<div class="tickets">
									{#if form?.reserved?.concert === date.id}
										<p class="msg ok" role="status">
											<Icon name="check" size={16} />
											<span>
												{t.parents.tickets.reserved}
												{#if form.reserved.mailed}{t.parents.tickets.mailed}{/if}
												<a href={form.reserved.path}>{t.parents.tickets.show}</a>
											</span>
										</p>
									{:else if ticketsFor === date.id}
										<form method="POST" action="?/tickets" use:enhance={reserving.submit()}>
											<input type="hidden" name="concert" value={date.id} />
											<p class="meta">{t.parents.tickets.left(date.tickets.left)} {t.parents.tickets.payAtDoor}</p>
											<label class="field">{t.parents.tickets.name}<input name="name" value={data.name} maxlength="120" autocomplete="name" /></label>
											<div class="counts">
												{#each date.tickets.prices as price (price.type)}
													<label class="field">
														{t.parents.tickets.count(price.label, price.price)}
														<input name="count:{price.type}" type="number" min="0" max={date.tickets.maxPerOrder} value="0" inputmode="numeric" />
													</label>
												{/each}
											</div>
											{#if form?.ticketError && form.ticketConcert === date.id}<p class="msg error" role="alert">{form.ticketError}</p>{/if}
											<div class="buttons">
												<button class="btn small" disabled={reserving.busy}><Icon name="tag" size={14} />{t.parents.tickets.reserve}</button>
												<button class="btn ghost small" type="button" onclick={() => (ticketsFor = null)}>{t.parents.cancel}</button>
											</div>
										</form>
									{:else}
										<button class="btn secondary small" type="button" onclick={() => (ticketsFor = date.id)}><Icon name="tag" size={14} />{t.parents.tickets.title}</button>
									{/if}
								</div>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<section class="block">
	<a class="ui-card write" href="/eltern/nachrichten">
		<Icon name="mail" size={22} />
		<span>
			<strong>{t.parents.write}</strong>
			<small>{t.parents.messages.lead}</small>
		</span>
		<Icon name="chevron" size={16} />
	</a>
</section>

<style>
	.kids {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0 0 var(--space-6);
		padding: 0;
		list-style: none;
	}

	.kids li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.kids span {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.block {
		margin-bottom: var(--space-6);
	}

	.notices {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.notice h3 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-lg);
	}

	.notice .body {
		margin: 0 0 var(--space-2);
		white-space: pre-line;
	}

	.meta {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.date {
		display: grid;
		grid-template-columns: 52px 1fr;
		gap: var(--space-4);
		padding: var(--space-4);
	}

	.when {
		display: grid;
		justify-items: center;
		align-content: start;
		padding: var(--space-2) 0;
		border-radius: var(--radius-m);
		background: var(--surface-2);
		line-height: 1.1;
	}

	.weekday,
	.month {
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 600;
		text-transform: uppercase;
	}

	.day {
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.what {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.what h3 {
		margin: 0;
		font-size: var(--text-md);
	}

	.kind {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.type {
		font-weight: 650;
	}

	.type-konzert,
	.type-generalprobe {
		color: var(--accent);
	}

	.answers {
		display: grid;
		gap: var(--space-3);
		margin: var(--space-3) 0 0;
		padding: 0;
		list-style: none;
	}

	.answers li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
	}

	.child {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.state {
		padding: 2px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.state-yes {
		background: color-mix(in oklab, var(--ok) 15%, transparent);
		color: var(--text);
	}

	.state-no {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
		color: var(--text);
	}

	.saved {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		color: var(--ok);
		font-size: var(--text-xs);
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.excuse {
		display: grid;
		gap: var(--space-2);
		flex-basis: 100%;
	}

	.tickets {
		margin-top: var(--space-3);
	}

	.tickets form {
		display: grid;
		gap: var(--space-3);
	}

	.counts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: var(--space-2);
	}

	.write {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		color: inherit;
		text-decoration: none;
	}

	.write span {
		display: grid;
		flex: 1;
		gap: var(--space-1);
	}

	.write small {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>
