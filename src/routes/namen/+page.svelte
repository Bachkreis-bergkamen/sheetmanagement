<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { config } from '#lib/config/index.ts';
	import { t } from '#lib/i18n/index.ts';
	import { checkSection, maxShortTitle, RENAME_BATCH } from '#lib/music/naming.ts';
	import { createInstrumentMatcher } from '#lib/music/part-name.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data } = $props();

	const matcher = createInstrumentMatcher(config.instruments);
	/** Short titles people changed, by section; the rest use the guess. */
	let shortTitles = $state<Record<string, string>>({});
	/** Files left out of a rename, by file id. */
	let skipped = $state<Record<string, boolean>>({});
	/** Files on their way to Drive, and ones already renamed there, by file id: shown at once. */
	let status = $state<Record<string, 'pending' | 'done'>>({});
	let filter = $state<'all' | 'rename' | 'unclear'>('rename');

	// Recomputed whenever a short title changes, with the same code the server uses before renaming.
	const sections = $derived(
		data.sections.map((section) => {
			const shortTitle = shortTitles[section.key] ?? section.shortTitle;
			const checks = checkSection(section.files, shortTitle, config.naming, matcher, {
				movement: section.movement,
				titles: section.titles
			}).filter((check) => check.state === 'rename' || check.state === 'unclear');
			const chosen = checks.filter((check) => check.state === 'rename' && !skipped[check.id] && !status[check.id]);
			return { ...section, shortTitle, checks, chosen };
		})
	);
	const shown = $derived(
		sections.filter((section) =>
			filter === 'all' ? section.checks.length : section.checks.some((check) => check.state === filter)
		)
	);

	type Job = { key: string; folder: string; shortTitle: string; ids: string[] };
	/** While renaming: how far each folder got. Several folders may run at once. */
	let progress = $state<Record<string, { done: number; total: number }>>({});
	/** What happened in the folder that finished last. */
	let result = $state<{ renamed: number; failed: string[]; folder: string } | null>(null);

	async function post(body: object) {
		const response = await fetch('/namen/umbenennen', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? String(response.status));
		return (await response.json()) as { renamed: { id: string; name: string }[]; failed: string[] };
	}

	// A few batches at a time, across all folders: faster than one by one, gentle on Drive.
	const PARALLEL = 3;
	let active = 0;
	const waiting: (() => void)[] = [];
	async function limited<T>(task: () => Promise<T>): Promise<T> {
		if (active >= PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
		active++;
		try {
			return await task();
		} finally {
			active--;
			waiting.shift()?.();
		}
	}

	/** New names waiting to be written into the server's cached archive, once nothing runs. */
	let unsaved: { id: string; name: string }[] = [];
	async function refreshWhenIdle() {
		if (Object.keys(progress).length || !unsaved.length) return;
		const names = unsaved;
		unsaved = [];
		await post({ refresh: names }).catch(() => {});
		await invalidateAll();
	}

	/** Renames one folder's files in small batches; each file shows as renamed as soon as Drive says so. */
	async function rename(job: Job) {
		if (!job.ids.length || progress[job.key]) return;
		for (const id of job.ids) status[id] = 'pending';
		progress[job.key] = { done: 0, total: job.ids.length };
		let renamed = 0;
		const failed: string[] = [];
		const batches: string[][] = [];
		for (let i = 0; i < job.ids.length; i += RENAME_BATCH) batches.push(job.ids.slice(i, i + RENAME_BATCH));
		await Promise.all(
			batches.map((ids) =>
				limited(async () => {
					try {
						const answer = await post({ key: job.key, shortTitle: job.shortTitle, ids });
						for (const file of answer.renamed) status[file.id] = 'done';
						unsaved.push(...answer.renamed);
						renamed += answer.renamed.length;
						failed.push(...answer.failed);
					} catch (error) {
						failed.push(`${ids.length} × ${(error as Error).message}`);
					}
					// Whatever didn't go through can be ticked and tried again.
					for (const id of ids) if (status[id] === 'pending') delete status[id];
					progress[job.key].done += ids.length;
				})
			)
		);
		delete progress[job.key];
		result = { renamed, failed, folder: job.folder };
		// In the background: the page is already up to date; this only makes reloads show the new names.
		void refreshWhenIdle();
	}

	const jobOf = (section: (typeof sections)[number]): Job => ({
		key: section.key,
		folder: section.section ? `${section.folderName} · ${section.section}` : section.folderName,
		shortTitle: section.shortTitle,
		ids: section.chosen.map((check) => check.id)
	});
</script>

<Title title={t.naming.title} />
<PageHeader title={t.naming.title} lead={t.naming.lead} />

<!-- Up here: once its files are renamed, a folder can drop out of the list below. -->
{#if result}
	<p class="msg {result.failed.length ? 'error' : 'ok'}" role="status">
		<Icon name={result.failed.length ? 'alert' : 'check'} size={16} />
		{t.naming.renamedIn(result.renamed, result.folder)}{result.failed.length ? ` ${t.naming.failed(result.failed)}` : ''}
	</p>
{/if}

{#if !data.ok}
	<p class="msg error">{t.naming.failedLoad}</p>
{:else if !data.sections.length}
	<p class="msg ok"><Icon name="check" size={16} />{t.naming.none}</p>
{:else}
	<p class="summary">{t.naming.counts(data.counts.rename, data.counts.unclear, data.counts.folders)}</p>
	{#if !data.driveWrite}<p class="msg info">{t.naming.noDriveWrite}</p>{/if}

	<div class="filters" role="tablist">
		{#each ['rename', 'unclear', 'all'] as const as key (key)}
			<button role="tab" class="filter" class:active={filter === key} aria-selected={filter === key} onclick={() => (filter = key)}>
				{t.naming.filter[key]}
			</button>
		{/each}
	</div>

	<ul class="sections">
		{#each shown as section (section.key)}
			<li class="section">
				<div class="head">
					<a class="folder" href="/stuecke/{encodeURIComponent(section.pieceId)}">{section.folderName}</a>
					{#if section.section}<span class="tag">{section.section}</span>{/if}
					<a class="drive" href={section.folderUrl} target="_blank" rel="noopener noreferrer">
						<Icon name="folder" size={14} />{t.naming.openFolder}
					</a>
				</div>

				<!-- Not a form: renaming runs in batches from the page, there's nothing to submit. -->
				<div class="rename">
					<label class="short">
						<span>{t.naming.shortTitle}</span>
						<input
							name="shortTitle"
							value={section.shortTitle}
							maxlength="120"
							autocomplete="off"
							title={t.naming.shortTitleHint}
							oninput={(event) => (shortTitles[section.key] = event.currentTarget.value)}
						/>
						{#if section.shortTitle.length > maxShortTitle(config.naming)}<span class="warn">{t.naming.long}</span>{/if}
					</label>

					<ul class="files">
						{#each section.checks as check (check.id)}
							<li class:unclear={check.state === 'unclear'}>
								{#if status[check.id] === 'done'}
									<div class="file done">
										<Icon name="check" size={16} />
										<span class="names">
											<span class="old">{check.name}</span>
											<span class="new">{check.suggested}</span>
										</span>
									</div>
								{:else if check.state === 'rename'}
									<label class="file" class:pending={status[check.id] === 'pending'}>
										<input
											type="checkbox"
											name="id"
											value={check.id}
											checked={!skipped[check.id]}
											disabled={!!status[check.id]}
											onchange={(event) => (skipped[check.id] = !event.currentTarget.checked)}
										/>
										<span class="names">
											<span class="old">{check.name}</span>
											<span class="new"><Icon name="arrow" size={14} />{check.suggested}</span>
										</span>
									</label>
								{:else}
									<div class="file">
										<span class="badge">{t.naming.unclear}</span>
										<span class="names">
											<span>{check.name}</span>
											<span class="muted">
												{#if check.unrecognized.length}
													{t.naming.unclearHint(check.unrecognized.join(', '))}
												{:else if check.taken}
													{t.naming.takenHint(check.taken)}
												{:else}
													{t.naming.nothingHint}
												{/if}
											</span>
										</span>
									</div>
								{/if}
							</li>
						{/each}
					</ul>

					{#if progress[section.key]}
						{@const run = progress[section.key]}
						<div class="running">
							<div
								class="bar"
								role="progressbar"
								aria-valuemin="0"
								aria-valuemax={run.total}
								aria-valuenow={run.done}
								aria-label={t.naming.progress(run.done, run.total)}
							>
								<span style="width: {Math.max(4, (100 * run.done) / run.total)}%"></span>
							</div>
							<p aria-live="polite">{t.naming.progress(run.done, run.total)}</p>
						</div>
					{:else if section.chosen.length}
						<button class="btn" type="button" disabled={!data.driveWrite} onclick={() => rename(jobOf(section))}>
							<Icon name="check" size={16} />{t.naming.rename(section.chosen.length)}
						</button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.msg {
		margin-bottom: var(--space-4);
	}

	.running {
		display: grid;
		gap: var(--space-2);
	}

	.bar {
		height: 8px;
		overflow: hidden;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
	}

	.bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--accent);
		transition: width 0.3s var(--ease);
	}

	.summary {
		margin-bottom: var(--space-3);
		color: var(--text-muted);
	}

	.filters {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		overflow-x: auto;
	}

	.filter {
		padding: 6px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}

	.filter.active {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.sections {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.section {
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.folder {
		font-weight: 600;
	}

	.folder:hover {
		color: var(--accent);
	}

	.drive {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.drive:hover {
		text-decoration: underline;
	}

	.tag {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.rename {
		display: grid;
		gap: var(--space-3);
	}

	.short {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.short input {
		flex: 1 1 220px;
		max-width: 360px;
		padding: 6px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-s);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-weight: 400;
	}

	.warn {
		color: var(--warn);
		font-size: var(--text-xs);
	}

	.files {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}

	.file {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-s);
	}

	label.file {
		cursor: pointer;
	}

	label.file:hover {
		background: var(--surface-2);
	}

	.file input {
		margin-top: 3px;
		accent-color: var(--accent);
	}

	.names {
		display: grid;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.old {
		color: var(--text-muted);
		text-decoration: line-through;
		text-decoration-color: color-mix(in oklab, var(--text-muted) 50%, transparent);
	}

	.new {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 600;
	}

	.file.done {
		color: var(--ok);
	}

	.file.done .new {
		color: var(--text);
	}

	.file.pending .new {
		animation: pulse 1s var(--ease) infinite alternate;
	}

	@keyframes pulse {
		to {
			opacity: 0.45;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.file.pending .new {
			animation: none;
		}
	}

	.badge {
		flex: none;
		padding: 0 6px;
		border-radius: var(--radius-xs);
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
		font-size: var(--text-2xs);
		font-weight: 700;
	}

	.muted {
		color: var(--text-muted);
	}

	.btn {
		justify-self: start;
	}
</style>
