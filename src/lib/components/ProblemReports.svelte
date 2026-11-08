<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { REPORT_KINDS, type ReportKind } from '#lib/feedback/feedback.ts';
	import { t } from '#lib/i18n/index.ts';
	import Icon from './Icon.svelte';
	import InstrumentSelect from './InstrumentSelect.svelte';

	interface OpenReport {
		id: string;
		part: string;
		fileId: string;
		kind: ReportKind;
		comment: string;
		status?: 'open' | 'scan';
		reportedAt: string;
		reportedBy?: string;
	}

	let {
		reports,
		status,
		canClose,
		parts,
		kinds = REPORT_KINDS,
		recording,
		instruments = [],
		common = [],
		present = [],
		result,
		open = $bindable(false),
		fileId = $bindable(''),
		trigger = true
	}: {
		reports: OpenReport[];
		status: 'ready' | 'sign-in' | 'not-set-up' | 'no-parts';
		canClose: boolean;
		parts: { id: string; label: string }[];
		/** What can be reported; a piece without parts has only its Hörbeispiel. */
		kinds?: ReportKind[];
		/** The Hörbeispiel now, shown with "Hörbeispiel falsch". */
		recording?: string;
		/** For "Stimme fehlt": every instrument a part can be for … */
		instruments?: string[];
		/** … of which the usual ones are offered first, the rest behind "Mehr" … */
		common?: string[];
		/** … and the ones the piece already has a part for, offered last. */
		present?: string[];
		result?: { reportError?: string; reported?: boolean } | null;
		open?: boolean;
		fileId?: string;
		/** Its own "Problem melden" button; off when the page offers one elsewhere. */
		trigger?: boolean;
	} = $props();

	const saving = new FormState();
	let picked = $state<ReportKind>('missing');
	const kind = $derived(kinds.includes(picked) ? picked : kinds[0]);
	// A part that's missing has no file to pick: name the instrument instead.
	const missing = $derived(kind === 'missing' && !fileId);
	const absent = $derived(instruments.filter((name) => !present.includes(name)));
	const already = $derived(instruments.filter((name) => present.includes(name)));
	let dialog = $state<HTMLElement>();
	// Already reported and still looked after: said in the form, so nobody reports it twice.
	const reportedAlready = $derived(
		reports.find((report) => (fileId ? report.fileId === fileId : !report.fileId && report.kind === kind && (kind !== 'missing' || !report.part)))
	);

	$effect(() => {
		if (open) dialog?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	});
</script>

{#if result?.reported || open || (trigger && status !== 'no-parts') || (status === 'not-set-up' && canClose)}
	<section class="reports" id="melden" bind:this={dialog}>
		{#if result?.reported}
			<p class="msg ok" role="status"><Icon name="check" size={16} />{t.reports.thanks}</p>
		{/if}

		{#if status === 'ready'}
			{#if open}
				<form
					class="form"
					method="POST"
					action="?/report"
					use:enhance={saving.submit({
						reset: true,
						onSuccess: () => {
							open = false;
							fileId = '';
						}
					})}
				>
					<h3>{t.reports.report}</h3>
					<p class="muted">{t.reports.lead}</p>
					{#if result?.reportError}<p class="msg error" role="alert">{result.reportError}</p>{/if}
					<label class="field">
						{t.reports.kind}
						<select name="kind" required value={kind} onchange={(event) => (picked = event.currentTarget.value as ReportKind)}>
							{#each kinds as option (option)}<option value={option}>{t.feedbackValues.reportKind[option]}</option>{/each}
						</select>
					</label>
					{#if kind === 'recording'}
						<!-- Not about a part: what's there now, and room for a better link. -->
						<p class="muted wide">
							{t.reports.recording}:
							{#if recording?.startsWith('http')}<a href={recording} target="_blank" rel="noopener noreferrer nofollow">{recording}</a>{:else}{recording ?? t.reports.recordingNone}{/if}
						</p>
						<label class="field wide">
							{t.reports.suggestion}
							<input name="link" type="text" inputmode="url" maxlength="500" placeholder={t.reports.suggestionHint} autocomplete="off" />
						</label>
					{:else if missing && instruments.length}
						<label class="field">
							{t.reports.missingPart}
							<InstrumentSelect
								name="missingInstrument"
								required
								{common}
								groups={[
									{ label: t.reports.notInFolder, names: absent },
									{ label: t.reports.inFolder, names: already }
								]}
							/>
						</label>
						<label class="field">
							{t.reports.missingNumber}
							<select name="missingNumber">
								<option value="">–</option>
								{#each ['I', 'II', 'III', 'IV'] as roman, i (roman)}<option value={String(i + 1)}>{roman}</option>{/each}
							</select>
						</label>
					{:else}
						<label class="field">
							{t.reports.part}
							<select name="fileId" bind:value={fileId}>
								<option value="">{t.reports.wholePiece}</option>
								{#each parts as part (part.id)}<option value={part.id}>{part.label}</option>{/each}
							</select>
						</label>
					{/if}
					{#if reportedAlready}
						<p class="muted wide already"><Icon name="flag" size={12} />{t.reports.already(`${t.feedbackValues.reportKind[reportedAlready.kind]}${reportedAlready.comment ? ` – ${reportedAlready.comment}` : ''}`)}</p>
					{/if}
					<label class="field wide">
						{t.reports.comment}
						<input name="comment" maxlength="1000" placeholder={t.reports.commentHint} autocomplete="off" />
					</label>
					<div class="actions">
						<button class="btn" disabled={saving.busy}><Icon name="flag" size={16} />{t.reports.send}</button>
						<button class="btn ghost" type="button" onclick={() => (open = false)}>{t.reports.cancel}</button>
					</div>
				</form>
			{:else if trigger}
				<button class="btn ghost" onclick={() => (open = true)}><Icon name="flag" size={16} />{t.reports.report}</button>
			{/if}
		{:else if status === 'not-set-up' && canClose}
			<p class="msg info">{t.reports.notSetUp}</p>
		{/if}
	</section>
{/if}

<style>
	.reports {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
		scroll-margin-top: calc(var(--header-height) + var(--space-4));
	}

	.reports > .btn {
		justify-self: start;
	}


	.muted {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}


	.form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-3);
		padding: var(--space-5);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.form h3,
	.form > p,
	.wide,
	.actions {
		grid-column: 1 / -1;
	}

	p.wide {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.already {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.form h3 {
		font-size: var(--text-base);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
