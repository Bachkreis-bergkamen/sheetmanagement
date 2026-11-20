<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { FormState, showToast } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import { actionPath, dropQueuedAnswer, pendingAnswers, queueAnswer } from '#lib/offline/answers.svelte.ts';
	import { ANSWERS, type Answer } from '#lib/signups/signups.ts';
	import Icon from './Icon.svelte';

	/**
	 * "Ich komme · Vielleicht · Ich kann nicht" as three large buttons, each in its own colour,
	 * so the choice is clear without reading. On the event's page and on the start page's cards.
	 * Without a connection the answer waits on the device and is sent later (#191); it shows as
	 * chosen meanwhile, with a line saying so.
	 */
	let {
		action,
		answer,
		label,
		toastErrors = false
	}: {
		/** The event page's "answer" action, e.g. "?/answer" or "/kalender/<id>?/answer". */
		action: string;
		answer: Answer | null | undefined;
		/** For screen readers: what is being answered. */
		label: string;
		/** On another page than the event's: stay there, and a failed save shows as a toast. */
		toastErrors?: boolean;
	} = $props();

	const saving = new FormState();
	// The tapped answer shows as chosen at once; the sheet catches up in the background.
	let tapped = $state<string | null>(null);
	const account = $derived((page.data.user as { email?: string } | null | undefined)?.email ?? '');
	const path = $derived(actionPath(action, page.url.href));
	/** Answered without a connection, still to be sent. */
	const waiting = $derived(pendingAnswers.queue[path]);
	const submit = $derived(saving.submit({
		onStart: ({ submitter }) => (tapped = submitter?.getAttribute('name') === 'answer' ? submitter.getAttribute('value') : null),
		stay: toastErrors,
		onSuccess: () => account && dropQueuedAnswer(account, path),
		onFailure: (data) => {
			if (toastErrors) showToast(typeof data?.signupError === 'string' ? data.signupError : t.signups.failed);
		},
		offline: ({ submitter }) => {
			const value = submitter?.getAttribute('value') as Answer;
			if (account && ANSWERS.includes(value)) queueAnswer(account, path, value);
			else showToast(t.common.saveFailed);
		}
	}));
	const chosen = $derived((saving.busy && tapped) || waiting || answer);

	const ICONS = { yes: 'check', maybe: 'minus', no: 'x' } as const;
</script>

<form class="answers" method="POST" {action} use:enhance={submit} aria-label={label}>
	{#each ANSWERS as option (option)}
		<button
			class="answer {option}"
			class:chosen={chosen === option}
			aria-pressed={chosen === option}
			name="answer"
			value={option}
			disabled={saving.busy}
		>
			<span class="mark"><Icon name={ICONS[option]} size={16} /></span>
			<span class="word">{t.signups.answers[option]}</span>
		</button>
	{/each}
	{#if waiting}<p class="waiting" role="status"><Icon name="clock" size={14} />{t.signups.queued}</p>{/if}
</form>

<style>
	/* Three equal parts that never wrap; each one wears its answer's colour, the chosen one filled. */
	.answers {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-2);
	}

	.answer {
		--tone: var(--accent);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-width: 0;
		min-height: var(--tap);
		padding: var(--space-2);
		border: 1.5px solid color-mix(in oklab, var(--tone) 35%, var(--hairline));
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		transition:
			background var(--fast) var(--ease),
			color var(--fast) var(--ease),
			border-color var(--fast) var(--ease),
			transform var(--fast) var(--ease);
		font: inherit;
		font-size: var(--text-md);
		font-weight: 600;
		line-height: 1.2;
		text-align: center;
		cursor: pointer;
	}

	/* Under the buttons, across all three: the answer is on the device, not yet with the orchestra. */
	.waiting {
		display: flex;
		grid-column: 1 / -1;
		align-items: center;
		gap: var(--space-1);
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.answer.yes {
		--tone: var(--ok);
	}

	.answer.maybe {
		--tone: var(--warn);
	}

	.answer.no {
		--tone: var(--danger);
	}

	.mark {
		display: grid;
		place-items: center;
		flex: none;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: color-mix(in oklab, var(--tone) 14%, transparent);
		color: var(--tone);
	}

	.answer:hover:not(.chosen) {
		border-color: var(--tone);
		background: color-mix(in oklab, var(--tone) 6%, var(--surface));
	}

	.answer:active {
		transform: scale(0.97);
	}

	.answer.chosen {
		border-color: var(--tone);
		background: color-mix(in oklab, var(--tone) 16%, var(--surface));
		color: var(--tone);
		box-shadow: inset 0 0 0 1px var(--tone);
	}

	.answer.chosen .mark {
		background: var(--tone);
		color: var(--surface);
	}

	/* On phones the mark sits above the words, so "Ich kann nicht" keeps its part and its icon. */
	@media (max-width: 480px) {
		/* "Ich kann nicht" is the longest: a little more room keeps it on one line. */
		.answers {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.25fr);
		}

		.answer {
			flex-direction: column;
			gap: 4px;
			min-height: 64px;
			padding-inline: var(--space-1);
			font-size: var(--text-sm);
		}
	}

	/* While saving, the chosen answer already shows; only the others step back. */
	.answer:disabled {
		cursor: progress;
	}

	.answer:disabled:not(.chosen) {
		opacity: 0.6;
	}
</style>
