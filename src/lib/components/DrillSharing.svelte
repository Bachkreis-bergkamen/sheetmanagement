<script lang="ts">
	import { config } from '#lib/config/index.ts';
	import { t } from '#lib/i18n/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { CHALLENGE_DAYS, type BoardEntry, type Sharing } from '#lib/practice/drills/sharing.ts';

	/**
	 * Sharing from the Übebereich (#300), all off unless the member turns it on: the weekly board,
	 * the conductor and teachers, the parents. A young player sees which choices wait for a
	 * parent. Below, this week's board when the member is on it: days practised, not skill.
	 */
	let {
		sharing,
		board,
		onchange
	}: {
		sharing: { chosen: Sharing | null; effective: Sharing; child: boolean; consented: boolean };
		board: { week: string[]; entries: BoardEntry[] } | null;
		onchange: (next: Sharing) => Promise<void>;
	} = $props();
	const tx = t.drills.sharing;

	const chosen = $derived(sharing.chosen ?? { board: false, leaders: false, parents: false });
	let busy = $state(false);
	let failed = $state(false);
	async function toggle(key: keyof Sharing, on: boolean) {
		busy = true;
		failed = false;
		try {
			await onchange({ ...chosen, [key]: on });
		} catch {
			failed = true;
		}
		busy = false;
	}
	/** Choices a young player made that wait for a parent. */
	const waiting = $derived(sharing.child && !sharing.consented && (chosen.board || chosen.leaders));
	const me = $derived(board?.entries.find((entry) => entry.me));
	const dayOf = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(config.locale, { day: 'numeric', month: 'short' });
</script>

<section class="ui-card sharing" aria-labelledby="sharing-title">
	<h2 id="sharing-title" class="ui-label">{tx.title}</h2>
	<p class="lead">{tx.lead}</p>
	<fieldset disabled={busy} aria-labelledby="sharing-title">
		{#each ['board', 'leaders', 'parents'] as const as key (key)}
			<label class="check">
				<input type="checkbox" checked={chosen[key]} onchange={(event) => toggle(key, event.currentTarget.checked)} />
				<span>
					<strong>{tx[key].title}</strong>
					<small>{tx[key].hint}</small>
				</span>
			</label>
		{/each}
	</fieldset>
	{#if waiting}<p class="msg" role="status"><Icon name="clock" size={16} />{tx.waiting}</p>{/if}
	{#if failed}<p class="msg error" role="alert">{tx.failed}</p>{/if}
	<p class="hint">{tx.privacy}</p>

	{#if board}
		<div class="board">
			<div class="board-head">
				<h3>{tx.boardTitle}</h3>
				<span class="muted">{dayOf(board.week[0])} – {dayOf(board.week[6])}</span>
			</div>
			<p class="challenge">
				<Icon name={me?.met ? 'check' : 'sparkle'} size={16} />
				{me?.met ? tx.challengeMet : tx.challenge(CHALLENGE_DAYS, me?.days ?? 0)}
				<span class="muted">· {tx.challengeCount(board.entries.filter((entry) => entry.met).length, board.entries.length)}</span>
			</p>
			<ol class="entries">
				{#each board.entries as entry, i (i)}
					<li class:me={entry.me}>
						<span class="place">{entry.place}</span>
						<span class="name">{entry.me ? tx.you(entry.name) : entry.name}</span>
						<span class="dots" aria-hidden="true">
							{#each Array.from({ length: 7 }, (_, day) => day) as day (day)}<span class:on={day < entry.days}></span>{/each}
						</span>
						<span class="days">{tx.days(entry.days)}{#if entry.met}<Icon name="check" size={14} />{/if}</span>
					</li>
				{/each}
			</ol>
			<p class="hint">{tx.boardHint}</p>
		</div>
	{/if}
</section>

<style>
	.sharing {
		display: grid;
		gap: var(--space-3);
	}

	.lead {
		margin: 0;
		color: var(--text-muted);
	}

	fieldset {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.check {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
	}

	.check input {
		margin-top: 0.25em;
	}

	.check span {
		display: grid;
	}

	.check small {
		color: var(--text-muted);
	}

	.msg {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		margin: 0;
		font-size: var(--text-sm);
	}

	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.board {
		display: grid;
		gap: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
	}

	.board-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.board-head h3 {
		margin: 0;
		font-size: var(--text-base);
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.challenge {
		margin: 0;
		font-weight: 600;
	}

	.challenge :global(svg) {
		vertical-align: -0.15em;
		margin-inline-end: var(--space-1);
	}

	.entries {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.entries li {
		display: grid;
		grid-template-columns: 1.5rem minmax(0, 1fr) auto auto;
		gap: var(--space-2);
		align-items: center;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm, 6px);
	}

	.entries li.me {
		background: var(--surface-2);
		font-weight: 600;
	}

	.place {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		text-align: end;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dots {
		display: flex;
		gap: 3px;
	}

	.dots span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--surface-2);
		box-shadow: inset 0 0 0 1px var(--hairline);
	}

	.dots span.on {
		background: var(--accent);
		box-shadow: none;
	}

	.days {
		display: inline-flex;
		gap: 2px;
		align-items: center;
		min-width: 4.5rem;
		justify-content: flex-end;
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 420px) {
		.dots {
			display: none;
		}
	}
</style>
