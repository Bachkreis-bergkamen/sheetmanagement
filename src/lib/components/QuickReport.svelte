<script lang="ts">
	import { REPORT_KINDS, type ReportKind } from '#lib/feedback/feedback.ts';
	import { t } from '#lib/i18n/index.ts';
	import Icon from './Icon.svelte';

	/**
	 * Reporting a problem with one part from where it's played (#306): the practice viewer and
	 * "Meine Noten". The same report as on the piece page (src/lib/server/report-form.ts), with
	 * piece and part already known, so it's the kind and a word or two. A part that's missing
	 * names its instrument instead of a file.
	 */
	let {
		pieceId,
		fileId = '',
		part,
		missing,
		page,
		reports = [],
		open = $bindable(false),
		onclose
	}: {
		pieceId: string;
		/** The part's file; none for a part the folder doesn't have. */
		fileId?: string;
		/** "Geige II", in the title. */
		part: string;
		/** For a part that's missing: its instrument and number. */
		missing?: { instrument: string; number?: number };
		/** The page open in the viewer, put in the comment. */
		page?: number;
		/** Reports still looked after for this part, so nobody reports the same thing twice. */
		reports?: { kind: ReportKind; comment: string }[];
		open?: boolean;
		/** Once the dialog is closed, sent or not. */
		onclose?: () => void;
	} = $props();

	/** About the part's file: not a missing part, not the Hörbeispiel. */
	const FILE_KINDS = REPORT_KINDS.filter((kind) => kind !== 'missing' && kind !== 'recording');
	const kinds = $derived<ReportKind[]>(missing ? ['missing'] : FILE_KINDS);

	let dialog = $state<HTMLDialogElement>();
	let kind = $state<ReportKind>('notes');
	let comment = $state('');
	let busy = $state(false);
	let error = $state('');
	let sent = $state(false);
	const uid = $props.id();

	$effect(() => {
		if (!open || !dialog || dialog.open) return;
		kind = kinds.includes('notes') ? 'notes' : kinds[0];
		comment = page ? t.reports.onPage(page) : '';
		error = '';
		sent = false;
		dialog.showModal();
	});

	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (!navigator.onLine) return void (error = t.reports.offline);
		busy = true;
		error = '';
		const data = new FormData();
		data.set('pieceId', pieceId);
		data.set('kind', kind);
		data.set('comment', comment.trim());
		if (fileId) data.set('fileId', fileId);
		if (missing && !fileId) {
			data.set('missingInstrument', missing.instrument);
			if (missing.number) data.set('missingNumber', String(missing.number));
		}
		try {
			const response = await fetch('/api/meldungen', { method: 'POST', body: data });
			const result = (await response.json().catch(() => ({}))) as { reported?: boolean; reportError?: string; message?: string };
			if (result.reported) sent = true;
			else error = result.reportError ?? result.message ?? t.reports.failed;
		} catch {
			error = t.reports.failed;
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="quick-report"
	aria-labelledby="{uid}-title"
	onclose={() => {
		open = false;
		onclose?.();
	}}
	onclick={(event) => {
		if (event.target === dialog) dialog?.close();
	}}
>
	<header>
		<h2 id="{uid}-title">{t.reports.reportPart(part)}</h2>
		<button type="button" class="close" aria-label={t.reports.cancel} onclick={() => dialog?.close()}><Icon name="x" size={18} /></button>
	</header>
	{#if sent}
		<div class="body">
			<p class="msg ok" role="status"><Icon name="check" size={16} />{t.reports.thanks}</p>
			<button type="button" class="btn" onclick={() => dialog?.close()}>{t.reports.closeDialog}</button>
		</div>
	{:else}
		<form class="body" onsubmit={send}>
			<p class="muted">{t.reports.lead}</p>
			{#if error}<p class="msg error" role="alert">{error}</p>{/if}
			{#if reports.length}
				<ul class="already">
					{#each reports as report, i (i)}
						<li><Icon name="flag" size={12} />{t.reports.already(`${t.feedbackValues.reportKind[report.kind]}${report.comment ? ` – ${report.comment}` : ''}`)}</li>
					{/each}
				</ul>
			{/if}
			{#if kinds.length > 1}
				<label class="field">
					{t.reports.kind}
					<select name="kind" required bind:value={kind}>
						{#each kinds as option (option)}<option value={option}>{t.feedbackValues.reportKind[option]}</option>{/each}
					</select>
				</label>
			{/if}
			<label class="field">
				{t.reports.comment}
				<input name="comment" maxlength="1000" placeholder={t.reports.commentHint} autocomplete="off" bind:value={comment} />
			</label>
			<div class="actions">
				<button class="btn" disabled={busy}><Icon name="flag" size={16} />{t.reports.send}</button>
				<button class="btn ghost" type="button" onclick={() => dialog?.close()}>{t.reports.cancel}</button>
			</div>
		</form>
	{/if}
</dialog>

<style>
	/* A sheet from below on phones, a card in the middle on wide screens. */
	.quick-report {
		position: fixed;
		inset: auto 0 0;
		width: 100%;
		max-width: none;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius-l) var(--radius-l) 0 0;
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-raised);
	}

	.quick-report[open] {
		animation: sheet-in 0.25s var(--ease);
	}

	@keyframes sheet-in {
		from {
			transform: translateY(24px);
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.quick-report[open] {
			animation: none;
		}
	}

	.quick-report::backdrop {
		background: var(--scrim);
	}

	@media (min-width: 721px) {
		.quick-report {
			inset: 0;
			width: min(480px, calc(100vw - 2 * var(--space-6)));
			height: fit-content;
			margin: auto;
			border-radius: var(--radius-l);
		}
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5) 0;
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 600;
	}

	.close {
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.close:hover {
		background: var(--surface-2);
	}

	.body {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-5) var(--space-5);
	}

	.muted {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.already {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.already li {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.body > .btn {
		justify-self: start;
	}
</style>
