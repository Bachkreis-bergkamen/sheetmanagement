<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { FormState, showToast } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import type { Priority } from '#lib/repertoire/priority.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import Title from '#lib/components/Title.svelte';

	/**
	 * The reports as a board: Neu → Zum Scannen → Erledigt. A card moves on with its own
	 * buttons; on a phone one column shows at a time.
	 */

	let { data, form } = $props();
	const saving = new FormState();
	const submit = saving.submit({ reset: true });
	const sent = saving.submit({ onSuccess: () => showToast(t.reports.sent) });

	type View = 'inbox' | 'scan' | 'done';
	const PARAM: Record<View, string | null> = { inbox: null, scan: 'scannen', done: 'erledigt' };
	// svelte-ignore state_referenced_locally
	let view = $state<View>(data.view);
	// svelte-ignore state_referenced_locally
	let mineOnly = $state(data.mineOnly);

	function setParams() {
		const url = new URL(page.url.href);
		if (PARAM[view]) url.searchParams.set('ansicht', PARAM[view]!);
		else url.searchParams.delete('ansicht');
		if (mineOnly) url.searchParams.set('meine', '');
		else url.searchParams.delete('meine');
		replaceState(url, {});
	}

	const groups = $derived(
		mineOnly ? data.scan.map((group) => ({ ...group, jobs: group.jobs.filter((job) => job.mine) })).filter((group) => group.jobs.length) : data.scan
	);
	const counts = $derived({
		inbox: data.inbox.length + data.found.length,
		scan: data.scan.reduce((sum, group) => sum + group.jobs.length, 0),
		done: data.done.length
	});
	const subject = (report: { kind: string; part: string }) => (report.kind === 'recording' ? t.reports.recording : report.part || t.reports.wholePiece);
	const wordOf = (status: string | undefined) => data.statusWords.find((s) => s.status === status)?.word ?? '';
</script>

<Title title={t.reports.title} />
<PageHeader title={t.reports.title} lead={t.reports.pageLead} />

{#snippet jobFields(job: { priority?: Priority; assignee?: string; task: string })}
	<label class="field">
		<span class="sr-only">{t.gaps.priority}</span>
		<select name="priority" value={job.priority ?? 'medium'} aria-label={t.gaps.priority}>
			<option value="">{t.gaps.noPriority}</option>
			{#each data.priorities as option (option)}<option value={option}>{t.gaps.priorities[option]}</option>{/each}
		</select>
	</label>
	<label class="field">
		<span class="sr-only">{t.gaps.assignee}</span>
		<select name="assignee" value={job.assignee ?? ''} aria-label={t.gaps.assignee}>
			<option value="">{t.gaps.assignee}: {t.gaps.nobody}</option>
			{#each data.scanners as person (person.email)}<option value={person.email}>{person.name}</option>{/each}
		</select>
	</label>
	<label class="field wide">
		<span class="sr-only">{t.reports.task}</span>
		<input name="task" maxlength="300" value={job.task} placeholder={t.reports.task} autocomplete="off" />
	</label>
{/snippet}

{#snippet look(url: string | undefined)}
	{#if url}<a class="look" href={url} target="_blank" rel="noopener noreferrer"><Icon name="eye" size={14} />{t.reports.look}</a>{/if}
{/snippet}

{#if data.state === 'not-set-up'}
	<p class="msg info">{t.reports.notSetUp}</p>
{:else}
	{#if form?.message}
		<p class="msg error" role="alert">{form.message}</p>
	{:else if form && 'warning' in form && form.warning}
		<p class="msg error" role="alert">{form.warning}</p>
	{/if}

	<div class="switch">
		<Segmented
			label={t.reports.title}
			options={[
				{ value: 'inbox', label: `${t.reports.tabs.inbox} · ${counts.inbox}`, icon: 'bell' },
				{ value: 'scan', label: `${t.reports.tabs.scan} · ${counts.scan}`, icon: 'file' },
				{ value: 'done', label: t.reports.tabs.done, icon: 'check' }
			]}
			bind:value={view}
			onchange={setParams}
		/>
	</div>

	<div class="board">
		<!-- Neu: from members and from the page check. -->
		<section class="column" class:shown={view === 'inbox'} aria-labelledby="col-inbox">
			<h2 id="col-inbox">{t.reports.tabs.inbox} <span class="count">{counts.inbox}</span></h2>
			{#if !counts.inbox}<p class="empty">{t.reports.noInbox}</p>{/if}
			{#each data.inbox as report (report.id)}
				<article class="card">
					<div class="meta">
						<a class="piece" href="/stuecke/{encodeURIComponent(report.pieceId)}">{report.pieceName || t.reports.toPiece}</a>
						<span>{t.reports.by(report.reportedBy, report.reportedAt)}</span>
					</div>
					<p class="what"><strong>{subject(report)}</strong><span class="kind">{t.feedbackValues.reportKind[report.kind]}</span></p>
					{#if report.comment}<p class="comment">{t.common.quote(report.comment)}</p>{/if}
					{#if report.kind === 'recording'}
						<p class="fine">
							{t.reports.recording}:
							{#if report.recording?.startsWith('http')}<a href={report.recording} target="_blank" rel="noopener noreferrer nofollow">{report.recording}</a>{:else}{report.recording || t.reports.recordingNone}{/if}
						</p>
						{#if report.link}<p class="fine">{t.reports.suggested}: <a href={report.link} target="_blank" rel="noopener noreferrer nofollow">{report.link}</a></p>{/if}
					{/if}
					<div class="tools">
						{@render look(report.url)}
						{#if report.inDrive}<span class="badge"><Icon name="check" size={12} />{t.reports.inDrive}</span>{/if}
						{#if report.marked}<span class="badge warn">{t.reports.marked(wordOf(report.marked))}</span>{/if}
					</div>

					{#if report.placeholder && !report.placeholder.exists}
						{@const manual = !data.driveWrite || form?.manual?.id === report.id}
						<div class="extra">
							{#if manual}
								<span class="fine">{t.reports.placeholderManual}</span>
								<code>{report.placeholder.name}</code>
								<a class="look" href={report.placeholder.folderUrl} target="_blank" rel="noopener noreferrer"><Icon name="folder" size={14} />{t.naming.openFolder}</a>
							{:else}
								<form method="POST" action="?/confirmMissing" use:enhance={submit} title={t.reports.confirmMissingHint(report.placeholder.name)}>
									<input type="hidden" name="id" value={report.id} />
									<button class="btn small ghost" disabled={saving.busy}><Icon name="check" size={14} />{t.reports.confirmMissing}</button>
								</form>
							{/if}
						</div>
					{/if}
					{#if data.driveWrite && report.fileId && !report.marked}
						<form method="POST" action="?/mark" use:enhance={submit} class="extra" title={t.reports.markHint}>
							<input type="hidden" name="id" value={report.id} />
							<select name="status" value={report.suggested} aria-label={t.reports.markLabel}>
								{#each data.statusWords as option (option.status)}<option value={option.status}>{option.word}</option>{/each}
							</select>
							<button class="btn small ghost" disabled={saving.busy}><Icon name="text" size={14} />{t.reports.mark}</button>
						</form>
					{/if}

					{#if report.scannable}
						<form method="POST" action="?/toScan" use:enhance={sent} class="triage" title={t.reports.toScanHint}>
							<input type="hidden" name="id" value={report.id} />
							{@render jobFields(report)}
							<button class="btn small" disabled={saving.busy}><Icon name="arrow" size={14} />{t.reports.toScan}</button>
							<button class="btn small ghost" formaction="?/dismiss" disabled={saving.busy} title={t.reports.dismissHint}>{t.reports.dismiss}</button>
						</form>
					{:else}
						<form method="POST" use:enhance={submit} class="triage">
							<input type="hidden" name="id" value={report.id} />
							{#if report.link && report.recording !== null && report.recording !== report.link}
								<button class="btn small" formaction="?/useSuggestion" disabled={saving.busy} title={t.reports.useSuggestionHint}><Icon name="headphones" size={14} />{t.reports.useSuggestion}</button>
							{/if}
							<button class="btn small ghost" formaction="?/close" disabled={saving.busy}><Icon name="check" size={14} />{t.reports.close}</button>
							<button class="btn small ghost" formaction="?/dismiss" disabled={saving.busy} title={t.reports.dismissHint}>{t.reports.dismiss}</button>
						</form>
					{/if}
				</article>
			{/each}
			{#each data.found as found (found.fileId)}
				<article class="card found">
					<div class="meta">
						<a class="piece" href="/stuecke/{encodeURIComponent(found.pieceId)}">{found.pieceName}</a>
						<span class="by-check" title={t.reports.checkHint}><Icon name="search" size={12} />{t.reports.byCheck}</span>
					</div>
					<p class="what"><strong>{found.part}</strong><span class="kind">{t.feedbackValues.reportKind[found.kind]}</span></p>
					<p class="comment">{found.comment}</p>
					<div class="tools">{@render look(found.url)}</div>
					<form method="POST" action="?/foundToScan" use:enhance={sent} class="triage" title={t.reports.toScanHint}>
						<input type="hidden" name="fileId" value={found.fileId} />
						{@render jobFields(found)}
						<button class="btn small" disabled={saving.busy}><Icon name="arrow" size={14} />{t.reports.toScan}</button>
						<button class="btn small ghost" formaction="?/dismissFound" disabled={saving.busy} title={t.reports.dismissHint}>{t.gaps.hintDismiss}</button>
					</form>
				</article>
			{/each}
		</section>

		<!-- Zum Scannen: by piece, the most urgent first. -->
		<section class="column" class:shown={view === 'scan'} aria-labelledby="col-scan">
			<div class="column-head">
				<h2 id="col-scan">{t.reports.tabs.scan} <span class="count">{counts.scan}</span></h2>
				<label class="mine"><input type="checkbox" bind:checked={mineOnly} onchange={setParams} />{t.reports.mineOnly}</label>
			</div>
			{#if !groups.length}<p class="empty">{mineOnly ? t.reports.noScansMine : t.reports.noScans}</p>{/if}
			{#each groups as group (group.pieceId)}
				<article class="card group {group.priority ?? 'none'}">
					<div class="meta">
						<a class="piece" href="/stuecke/{encodeURIComponent(group.pieceId)}">{group.pieceName || t.reports.toPiece}</a>
						{#if group.jobs.length > 1}<span>{t.reports.together(group.jobs.length)}</span>{/if}
					</div>
					<ul class="jobs">
						{#each group.jobs as job (job.id)}
							<li class="job {job.priority ?? 'none'}">
								<p class="what"><strong>{subject(job)}</strong><span class="kind">{t.feedbackValues.reportKind[job.kind]}</span></p>
								{#if job.task}<p class="task">{job.task}</p>{/if}
								{#if job.comment}<p class="comment fine">{t.common.quote(job.comment)}</p>{/if}
								<div class="tools">
									{#if job.priority}<span class="pill priority {job.priority}">{t.gaps.priorities[job.priority]}</span>{/if}
									<span class="pill" class:me={job.mine}><Icon name="user" size={12} />{job.mine ? t.gaps.assignedToMe : job.assigneeName ? t.gaps.assignedTo(job.assigneeName) : `${t.gaps.assignee}: ${t.gaps.nobody}`}</span>
									{@render look(job.url)}
								</div>
								<div class="moves">
									<form method="POST" action="?/close" use:enhance={submit} title={t.reports.scannedHint}>
										<input type="hidden" name="id" value={job.id} />
										<button class="btn small" disabled={saving.busy}><Icon name="check" size={14} />{t.reports.scanned}</button>
									</form>
									<details class="change">
										<summary><Icon name="edit" size={13} />{t.reports.changeJob}</summary>
										<form method="POST" action="?/toScan" use:enhance={sent} class="triage">
											<input type="hidden" name="id" value={job.id} />
											{@render jobFields(job)}
											<button class="btn small" disabled={saving.busy}>{t.gaps.save}</button>
											<button class="btn small ghost" formaction="?/reopen" disabled={saving.busy}>{t.reports.backToInbox}</button>
										</form>
									</details>
								</div>
							</li>
						{/each}
					</ul>
				</article>
			{/each}
		</section>

		<!-- Erledigt: the last hundred. -->
		<section class="column" class:shown={view === 'done'} aria-labelledby="col-done">
			<h2 id="col-done">{t.reports.tabs.done} <span class="count">{counts.done}</span></h2>
			{#if !data.done.length}<p class="empty">{t.reports.noDone}</p>{/if}
			{#each data.done as report (report.id)}
				<article class="card done">
					<div class="meta">
						<a class="piece" href="/stuecke/{encodeURIComponent(report.pieceId)}">{report.pieceName || t.reports.toPiece}</a>
						<span class="pill" class:dismissed={report.status === 'dismissed'}>{t.feedbackValues.reportStatus[report.status]}</span>
					</div>
					<p class="what"><strong>{subject(report)}</strong><span class="kind">{t.feedbackValues.reportKind[report.kind]}</span></p>
					{#if report.note}<p class="fine">{t.sheet.reports.columns.note}: {report.note}</p>{/if}
					<form method="POST" action="?/reopen" use:enhance={submit}>
						<input type="hidden" name="id" value={report.id} />
						<input type="hidden" name="note" value={report.note} />
						<button class="link-btn" disabled={saving.busy}>{t.reports.reopen}</button>
					</form>
				</article>
			{/each}
		</section>
	</div>
{/if}

<style>
	.switch {
		margin-bottom: var(--space-4);
	}

	.board {
		display: grid;
		gap: var(--space-4);
		align-items: start;
	}

	/* Narrow: one column at a time, chosen above. Wide: the whole board. */
	.column {
		display: none;
		gap: var(--space-3);
		min-width: 0;
		padding: var(--space-3);
		border-radius: var(--radius-l);
		background: var(--surface-2);
	}

	.column.shown {
		display: grid;
	}

	@media (min-width: 1000px) {
		.switch {
			display: none;
		}

		.board {
			grid-template-columns: 1.15fr 1.15fr 0.8fr;
		}

		.column {
			display: grid;
		}
	}

	.column h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 0 var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.column-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.mine {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.count {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface);
		letter-spacing: 0;
	}

	.empty {
		margin: 0;
		padding: var(--space-4);
		border: 1px dashed var(--border);
		border-radius: var(--radius-m);
		color: var(--text-muted);
		font-size: var(--text-sm);
		text-align: center;
	}

	/* A card; the priority shows as its left edge. */
	.card {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
		padding: var(--space-3);
		border: 1px solid var(--hairline);
		border-left: 3px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
		box-shadow: var(--shadow-sm, none);
	}

	.card.found {
		border-left-style: dashed;
	}

	.card.group.high,
	.job.high {
		border-left-color: var(--danger);
	}

	.card.group.medium,
	.job.medium {
		border-left-color: var(--warn);
	}

	.card.done {
		gap: var(--space-1);
		opacity: 0.85;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1) var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.piece {
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.by-check {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.what {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
	}

	.kind {
		padding: 0 6px;
		border-radius: var(--radius-xs);
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
		font-size: var(--text-2xs);
		font-weight: 700;
	}

	.comment,
	.task,
	.fine {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.task {
		font-size: var(--text-sm);
	}

	.fine {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.fine a {
		color: var(--accent);
	}

	.tools,
	.extra,
	.moves {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.extra code {
		padding: 0 6px;
		border-radius: var(--radius-xs);
		background: var(--surface-2);
		font-size: var(--text-xs);
		user-select: all;
	}

	.extra select {
		padding: 4px var(--space-2);
	}

	.look {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.badge,
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.badge {
		background: color-mix(in oklab, var(--ok) 12%, transparent);
		color: var(--ok);
	}

	.badge.warn {
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
	}

	.pill.priority.high {
		background: var(--danger);
		color: var(--accent-contrast);
	}

	.pill.priority.medium {
		background: color-mix(in oklab, var(--warn) 16%, transparent);
		color: var(--warn);
	}

	.pill.me {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.pill.dismissed {
		color: var(--text-muted);
	}

	/* The triage: priority and who on one line, the task below, then the moves. */
	.triage {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 130px), 1fr));
		gap: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--hairline);
	}

	.triage .field {
		margin: 0;
	}

	.triage .wide {
		grid-column: 1 / -1;
	}

	.triage select,
	.triage input {
		width: 100%;
		padding: 5px var(--space-2);
		font-size: var(--text-sm);
	}

	.jobs {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.job {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-2) 0 var(--space-2) var(--space-3);
		border-left: 3px solid var(--border);
	}

	.job + .job {
		border-top: 1px solid var(--hairline);
	}

	.change summary {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}

	.change summary::-webkit-details-marker {
		display: none;
	}

	.change[open] {
		flex-basis: 100%;
	}

	.link-btn {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
