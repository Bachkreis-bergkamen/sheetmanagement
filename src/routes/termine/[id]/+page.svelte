<script lang="ts">
	import { enhance } from '$app/forms';
	import { config } from '#lib/config/index.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import { ANSWERS, optionLabel, type PollAnswer } from '#lib/polls/polls.ts';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();

	const poll = $derived(data.poll);
	const label = (id: string) => optionLabel(poll.options.find((option) => option.id === id)!, config.locale);
	const score = (id: string) => data.scores.find((entry) => entry.id === id)!;
	const most = $derived(Math.max(1, data.responses.length));
	const MARK: Record<PollAnswer, IconName> = { yes: 'check', maybe: 'minus', no: 'x' };

	// Your answers, changed here until saved; a date you haven't answered starts empty.
	// svelte-ignore state_referenced_locally
	let choices = $state<Record<string, PollAnswer | undefined>>({ ...(data.mine?.choices ?? {}) });
	// The dates an organiser will close it with (#209): the best one ticked, following the
	// answers as they come in, until the organiser ticks or unticks one themselves.
	let picked = $state<string[]>([]);
	let touched = $state(false);
	$effect.pre(() => {
		const best = data.best;
		if (!touched) picked = best ? [best] : [];
	});
	const deadline = $derived(poll.deadline ? optionLabel({ date: poll.deadline }, config.locale) : null);
</script>

<Title title={poll.title} />

<a class="back" href="/termine"><Icon name="back" size={16} />{t.polls.title}</a>

<header class="head">
	<h1>{poll.title}</h1>
	<p class="meta">
		{t.polls.by(poll.createdByName)} · {t.polls.forGroups(poll.groups.join(', '))}
		{#if deadline && data.open}· {t.polls.until(`${deadline.weekday}, ${deadline.day}. ${deadline.month}`)}{/if}
	</p>
	{#if poll.note}<p class="note">{poll.note}</p>{/if}
</header>

{#if poll.closedAt}
	<!-- Decided: the dates, each one click away from the calendar. -->
	<section class="ui-card decided">
		<span class="badge"><Icon name="poll" size={22} /></span>
		<div class="body">
			<span class="over">{poll.chosen.length ? t.polls.chosen : t.polls.closed}</span>
			{#if poll.chosen.length}
				<ul class="picked">
					{#each poll.chosen as id (id)}
						{@const when = label(id)}
						<li>
							<strong>{when.long}</strong>
							{#if data.calendarUrls[id]}
								<a class="btn secondary small" href={data.calendarUrls[id]} target="_blank" rel="noopener noreferrer">
									<Icon name="calendar" size={14} />{t.polls.toCalendar}<span class="sr-only"> ({when.long})</span>
								</a>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		{#if data.manage}
			<form method="POST" action="?/reopen" use:enhance={saving.submit()}>
				<button class="btn secondary" disabled={saving.busy}><Icon name="refresh" size={16} />{t.polls.reopen}</button>
			</form>
		{/if}
	</section>
{/if}

{#if data.saved}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.polls.saved}</p>{/if}
{#if form?.error}<p class="msg error" role="alert">{form.error}</p>{/if}

<form id="poll-answers" method="POST" action="?/answer" use:enhance={saving.submit()}>
	<ul class="options">
		{#each poll.options as option (option.id)}
			{@const when = label(option.id)}
			{@const s = score(option.id)}
			<li class="ui-card option" class:best={data.best === option.id && !poll.closedAt} class:chosen={poll.chosen.includes(option.id)}>
				<span class="date" class:span={!!option.until} aria-hidden="true">
					<span class="weekday">{when.weekday}</span>
					<span class="day">{when.day}</span>
					<span class="month">{when.month}</span>
				</span>
				<span class="info">
					<span class="when">
						{when.time || when.long}
						{#if data.best === option.id && !poll.closedAt}<span class="tag best-tag"><Icon name="sparkle" size={12} />{t.polls.best}</span>{/if}
						{#if poll.chosen.includes(option.id)}<span class="tag chosen-tag"><Icon name="check" size={12} />{t.polls.chosen}</span>{/if}
					</span>
					<span class="bar" aria-hidden="true">
						<span class="yes" style:width="{(s.yes / most) * 100}%"></span>
						<span class="maybe" style:width="{(s.maybe / most) * 100}%"></span>
					</span>
					<span class="counts">{s.yes} {t.polls.answer.yes} · {s.maybe} {t.polls.answer.maybe} · {s.no} {t.polls.answer.no}</span>
				</span>
				{#if data.open}
					<fieldset class="mine">
						<legend class="sr-only">{when.long}</legend>
						{#each ANSWERS as answer (answer)}
							<label class="choice {answer}">
								<input type="radio" name="choice:{option.id}" value={answer} bind:group={choices[option.id]} />
								<span><Icon name={MARK[answer]} size={14} />{t.polls.answer[answer]}</span>
							</label>
						{/each}
					</fieldset>
				{/if}
				{#if data.manage && !poll.closedAt}
					<label class="take">
						<input type="checkbox" name="option" value={option.id} bind:group={picked} onchange={() => (touched = true)} />
						{t.polls.choose}<span class="sr-only"> ({when.long})</span>
					</label>
				{/if}
			</li>
		{/each}
	</ul>

	{#if data.open}
		<div class="answer-bar">
			<label class="field comment">
				{t.polls.comment}
				<input name="comment" value={data.mine?.comment ?? ''} maxlength="300" autocomplete="off" />
			</label>
			<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{t.polls.save}</button>
		</div>
	{/if}
</form>

{#if data.responses.length}
	<!-- Who said what, one row per person: the details behind the bars. -->
	<section class="block">
		<h2 class="ui-label">{t.polls.answers(data.responses.length)}</h2>
		<!-- Scrolls sideways on a phone; focusable so the keyboard can scroll it too. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="scroll ui-card" role="region" aria-label={t.polls.answers(data.responses.length)} tabindex="0">
			<table>
				<thead>
					<tr>
						<th></th>
						{#each poll.options as option (option.id)}
							{@const when = label(option.id)}
							<th scope="col"><span class="col">{when.short}</span></th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each data.responses as response (response.email)}
						<tr>
							<th scope="row">
								{response.name}
								{#if response.comment}<small>{response.comment}</small>{/if}
							</th>
							{#each poll.options as option (option.id)}
								{@const answer = response.choices[option.id]}
								<td class={answer ?? 'none'}>
									{#if answer}<Icon name={MARK[answer]} size={16} /><span class="sr-only">{t.polls.answer[answer]}</span>{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}

{#if data.waiting.length && data.open}
	<p class="waiting"><Icon name="clock" size={16} /><span>{t.polls.waiting}: {data.waiting.join(', ')}</span></p>
{/if}

{#if data.manage}
	<div class="manage">
		{#if !poll.closedAt}
			<!-- Sends the dates ticked above, which sit in the answers' form. -->
			<button class="btn" class:secondary={!picked.length} form="poll-answers" formaction="?/close" formnovalidate disabled={saving.busy}>
				<Icon name="check" size={16} />{t.polls.closeWith(picked.length)}
			</button>
		{/if}
		<form
			method="POST"
			action="?/remove"
			use:enhance={({ cancel }) => {
				if (!confirm(t.polls.removeConfirm)) cancel();
			}}
		>
			<button class="btn ghost danger"><Icon name="trash" size={16} />{t.polls.remove}</button>
		</form>
	</div>
{/if}

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
		color: var(--accent);
		font-weight: 600;
	}

	.head {
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-5);
	}

	.meta,
	.note {
		margin: 0;
		color: var(--text-muted);
	}

	.note {
		max-width: 60ch;
		color: var(--text);
	}

	.decided {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
		padding: var(--space-4);
		border-color: color-mix(in oklab, var(--ok) 40%, var(--border));
	}

	.decided .badge {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: var(--radius-control);
		background: color-mix(in oklab, var(--ok) 15%, transparent);
		color: var(--ok);
	}

	.decided .body {
		display: grid;
		flex: 1;
		gap: var(--space-1);
		min-width: 200px;
	}

	.picked {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.picked li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}


	.over {
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.options {
		display: grid;
		gap: var(--space-2);
		margin: 0 0 var(--space-4);
		padding: 0;
		list-style: none;
	}

	.option {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-4);
		padding: var(--space-3) var(--space-4);
		transition: border-color var(--fast) var(--ease);
	}

	.option.best {
		border-color: color-mix(in oklab, var(--accent) 55%, var(--border));
		box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 30%, transparent), var(--shadow);
	}

	.option.chosen {
		border-color: color-mix(in oklab, var(--ok) 55%, var(--border));
	}

	.date {
		display: grid;
		place-items: center;
		flex: none;
		width: 54px;
		padding: var(--space-1) 0;
		border-radius: var(--radius-control);
		background: var(--surface-2);
		line-height: 1.1;
	}

	.best .date {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.weekday,
	.month {
		font-size: var(--text-2xs);
		font-weight: 700;
		text-transform: uppercase;
	}

	.day {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: 700;
	}

	/* "18–19" in the same block: a wider block, a little smaller. */
	.date.span {
		width: 72px;
	}

	.date.span .day {
		font-size: var(--text-xl);
	}

	.info {
		display: grid;
		flex: 1;
		gap: 6px;
		min-width: 180px;
	}

	.when {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font-weight: 650;
	}

	.tag {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		font-size: var(--text-2xs);
		font-weight: 700;
	}

	.best-tag {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.chosen-tag {
		background: color-mix(in oklab, var(--ok) 15%, transparent);
		color: var(--ok);
	}

	.bar {
		display: flex;
		height: 8px;
		overflow: hidden;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
	}

	.bar .yes {
		background: var(--ok);
		transition: width 0.3s var(--ease);
	}

	.bar .maybe {
		background: color-mix(in oklab, var(--warn) 70%, var(--surface-2));
		transition: width 0.3s var(--ease);
	}

	.counts {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.mine {
		display: flex;
		gap: 4px;
		margin: 0;
		padding: 3px;
		border: 0;
		border-radius: var(--radius-control);
		background: var(--surface-2);
	}

	.choice {
		position: relative;
		cursor: pointer;
	}

	.choice input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.choice span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 34px;
		padding: 0 var(--space-3);
		border-radius: var(--radius-s);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 650;
		transition:
			background var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	.choice input:focus-visible + span {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.choice.yes input:checked + span {
		background: var(--ok);
		color: #fff;
	}

	.choice.maybe input:checked + span {
		background: var(--warn);
		color: #fff;
	}

	.choice.no input:checked + span {
		background: var(--surface);
		color: var(--danger);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--danger) 40%, transparent);
	}

	.take {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
		padding: 0 var(--space-3) 0 var(--space-2);
		border-radius: var(--radius-pill);
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: 650;
		cursor: pointer;
		transition: background var(--fast) var(--ease);
	}

	.take:hover,
	.take:has(input:checked) {
		background: var(--accent-soft);
	}

	.take input {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--accent);
	}

	.answer-bar {
		position: sticky;
		bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
		z-index: 5;
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3);
		margin-bottom: var(--space-6);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-l);
		background: color-mix(in oklab, var(--surface) 92%, transparent);
		backdrop-filter: blur(8px);
		box-shadow: var(--shadow-raised);
	}

	.comment {
		flex: 1;
		min-width: 200px;
	}

	.block {
		margin-bottom: var(--space-5);
	}

	/* Positioned, so the hidden answer labels in far columns stay inside it instead of widening the page. */
	.scroll {
		position: relative;
		overflow-x: auto;
		padding: 0;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	th,
	td {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--hairline);
		text-align: center;
		white-space: nowrap;
	}

	tbody th {
		text-align: left;
		font-weight: 600;
	}

	tbody th small {
		display: block;
		max-width: 22ch;
		overflow: hidden;
		color: var(--text-muted);
		font-weight: 400;
		text-overflow: ellipsis;
	}

	.col {
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 650;
	}

	td.yes {
		background: color-mix(in oklab, var(--ok) 14%, transparent);
		color: var(--ok);
	}

	td.maybe {
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
	}

	td.no {
		color: var(--danger);
	}

	.waiting {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.manage {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-6);
		padding-top: var(--space-4);
		border-top: 1px solid var(--hairline);
	}

	.danger {
		color: var(--danger);
	}

	/* Above the tab bar, which phones show at the bottom. */
	@media (max-width: 720px) {
		.answer-bar {
			bottom: calc(var(--tabbar-height) + var(--space-2) + env(safe-area-inset-bottom));
		}
	}

	@media (max-width: 560px) {
		.mine {
			width: 100%;
		}

		.choice {
			flex: 1;
		}

		.choice span {
			justify-content: center;
			width: 100%;
		}
	}
</style>
