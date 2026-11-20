<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { FormState } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Icon from './Icon.svelte';
	import InstrumentSelect from './InstrumentSelect.svelte';

	/**
	 * New sheet music from the app (#193), for librarians: create the piece's folder in Drive,
	 * then upload PDFs with convention names, or add a "- FEHLT" placeholder. Files go from the
	 * browser straight to Drive; the server only opens the upload and names the file.
	 */
	let {
		pieceId,
		tools,
		existing,
		instruments,
		common,
		created,
		result
	}: {
		pieceId: string;
		tools: { mode: 'create'; name: string } | { mode: 'upload'; maxBytes: number; owner?: string; needsAccount: boolean };
		/** File names already in the folder, to say which upload replaces one. */
		existing: string[];
		instruments: string[];
		common: string[];
		/** Just created: say what's next. */
		created: boolean;
		result?: { folderError?: string; folderName?: string; placeholderError?: string; placeholderCreated?: string } | null;
	} = $props();

	const saving = new FormState();
	const endpoint = $derived(`/stuecke/${encodeURIComponent(pieceId)}/hochladen`);

	interface Pending {
		file: File;
		name: string;
		label: string;
		unclear: boolean;
	}
	let pending = $state<Pending[]>([]);
	let skipped = $state<string[]>([]);
	let progress = $state<{ done: number; total: number } | null>(null);
	let outcome = $state<{ uploaded: number; failed: string[]; reasons: string[] } | null>(null);
	let problem = $state('');
	let dragging = $state(false);
	let shortTitle = $state('');

	const taken = $derived(new Set(existing.map((name) => name.toLowerCase())));
	const pdfName = (name: string) => (/\.pdf$/i.test(name.trim()) ? name.trim() : `${name.trim()}.pdf`);

	async function post<T>(body: Record<string, unknown>): Promise<T> {
		const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? t.pieceFolder.failed);
		return response.json() as Promise<T>;
	}

	async function choose(files: FileList | File[] | null | undefined) {
		const all = [...(files ?? [])];
		const pdfs = all.filter((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
		skipped = all.filter((file) => !pdfs.includes(file)).map((file) => file.name);
		outcome = null;
		problem = '';
		if (!pdfs.length) return;
		try {
			const answer = await post<{ shortTitle: string; files: { name: string; suggested?: string; label: string }[] }>({ step: 'names', names: pdfs.map((file) => file.name) });
			shortTitle = answer.shortTitle;
			pending = [
				...pending,
				...pdfs.map((file, i) => {
					const suggestion = answer.files[i];
					return { file, name: suggestion?.suggested ?? file.name, label: suggestion?.label ?? '', unclear: !suggestion?.suggested };
				})
			];
		} catch (error) {
			problem = (error as Error).message;
		}
	}

	async function upload() {
		const files = pending;
		progress = { done: 0, total: files.length };
		const failed: string[] = [];
		const reasons = new Set<string>();
		// Three at a time: a phone on a slow line still finishes, and Drive isn't flooded.
		let next = 0;
		const worker = async () => {
			while (next < files.length) {
				const item = files[next++];
				try {
					const { url } = await post<{ url: string }>({ step: 'start', name: item.name, size: item.file.size });
					const sent = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: item.file });
					if (!sent.ok) {
						// Drive says why, e.g. "storageQuotaExceeded" for a service account without storage.
						const answer = (await sent.json().catch(() => null)) as { error?: { message?: string; errors?: { reason?: string }[] } } | null;
						const quota = answer?.error?.errors?.some((e) => /quota/i.test(e.reason ?? '')) || /quota/i.test(answer?.error?.message ?? '');
						throw new Error(quota ? t.pieceFolder.noQuota : (answer?.error?.message ?? `Drive ${sent.status}`));
					}
				} catch (error) {
					console.error('Upload failed:', error);
					failed.push(item.file.name);
					reasons.add((error as Error).message || t.pieceFolder.failed);
				}
				progress = { done: progress!.done + 1, total: files.length };
			}
		};
		await Promise.all([worker(), worker(), worker()]);
		await post({ step: 'done' }).catch((error) => console.error(error));
		outcome = { uploaded: files.length - failed.length, failed, reasons: [...reasons] };
		pending = files.filter((item) => failed.includes(item.file.name));
		progress = null;
		await invalidateAll();
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		choose(event.dataTransfer?.files);
	}
</script>

<section class="block folder-tools" aria-labelledby="folder-tools-title">
	<h2 class="ui-label" id="folder-tools-title">{t.pieceFolder.title}</h2>

	{#if tools.mode === 'create'}
		<form class="form" method="POST" action="?/createFolder" use:enhance={saving.submit()}>
			<p class="muted">{t.pieceFolder.createLead}</p>
			{#if result?.folderError}<p class="msg error" role="alert">{result.folderError}</p>{/if}
			<label class="field">
				{t.pieceFolder.folderName}
				<input name="name" required maxlength="150" value={result?.folderName ?? tools.name} />
			</label>
			<button class="btn primary" disabled={saving.busy}><Icon name="folder" size={16} />{t.pieceFolder.create}</button>
		</form>
	{:else}
		{#if created}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.pieceFolder.created}</p>{/if}
		{#if tools.needsAccount}<p class="msg info">{t.pieceFolder.needsAccount}</p>{/if}

		<div
			class="drop"
			class:dragging
			role="region"
			aria-label={t.pieceFolder.dropHere}
			ondragover={(event) => {
				event.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={drop}
		>
			<p class="muted">{t.pieceFolder.uploadLead}{#if tools.owner}{' '}{t.pieceFolder.owner(tools.owner)}{/if}</p>
			<label class="btn">
				<Icon name="up" size={16} />{t.pieceFolder.choose}
				<input
					class="sr-only"
					type="file"
					accept="application/pdf,.pdf"
					multiple
					disabled={!!progress}
					onchange={(event) => {
						choose(event.currentTarget.files);
						event.currentTarget.value = '';
					}}
				/>
			</label>
		</div>

		{#if problem}<p class="msg error" role="alert">{problem}</p>{/if}
		{#if skipped.length}<p class="msg info">{t.pieceFolder.notPdf(skipped.join(', '))}</p>{/if}
		{#if outcome?.uploaded}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.pieceFolder.uploaded(outcome.uploaded)}</p>{/if}
		{#if outcome?.failed.length}
			<p class="msg error" role="alert">
				{t.pieceFolder.notUploaded(outcome.failed.join(', '))}
				{#each outcome.reasons as reason (reason)}<br />{reason}{/each}
			</p>
		{/if}

		{#if pending.length}
			{#if shortTitle}<p class="muted">{t.pieceFolder.shortTitle(shortTitle)}</p>{/if}
			<ul class="pending">
				{#each pending as item, i (item.file)}
					<li>
						<label class="field">
							<span class="old">{item.file.name}</span>
							<input
								aria-label={t.pieceFolder.newName(item.file.name)}
								bind:value={item.name}
								oninput={() => (item.unclear = false)}
								disabled={!!progress}
							/>
						</label>
						{#if item.unclear}<span class="hint warn">{t.pieceFolder.unclear}</span>{/if}
						{#if taken.has(pdfName(item.name).toLowerCase())}<span class="hint">{t.pieceFolder.replaces}</span>{/if}
						<button
							class="remove"
							type="button"
							aria-label={t.pieceFolder.discard}
							title={t.pieceFolder.discard}
							disabled={!!progress}
							onclick={() => (pending = pending.filter((_, j) => j !== i))}
						>
							<Icon name="x" size={16} />
						</button>
					</li>
				{/each}
			</ul>
			<div class="actions">
				<button class="btn primary" type="button" disabled={!!progress || pending.some((item) => !item.name.trim())} onclick={upload}>
					<Icon name="up" size={16} />
					{progress ? t.pieceFolder.uploading(progress.done, progress.total) : t.pieceFolder.upload(pending.length)}
				</button>
				<button class="btn" type="button" disabled={!!progress} onclick={() => (pending = [])}>{t.pieceFolder.discard}</button>
			</div>
		{/if}

		<details class="missing ui-disclosure">
			<summary>{t.pieceFolder.missing}</summary>
			<form class="form" method="POST" action="?/placeholder" use:enhance={saving.submit({ reset: true })}>
				<p class="muted">{t.pieceFolder.missingLead}</p>
				{#if result?.placeholderError}<p class="msg error" role="alert">{result.placeholderError}</p>{/if}
				{#if result?.placeholderCreated}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.pieceFolder.placeholderCreated(result.placeholderCreated)}</p>{/if}
				<label class="field">
					{t.pieceFolder.instrument}
					<InstrumentSelect name="instrument" required {common} groups={[{ names: instruments }]} />
				</label>
				<label class="field">
					{t.pieceFolder.number}
					<select name="number">
						<option value="">–</option>
						{#each ['I', 'II', 'III', 'IV'] as roman, i (roman)}<option value={String(i + 1)}>{roman}</option>{/each}
					</select>
				</label>
				<button class="btn" disabled={saving.busy}>{t.pieceFolder.addPlaceholder}</button>
			</form>
		</details>
	{/if}
</section>

<style>
	.folder-tools {
		display: grid;
		gap: var(--space-3);
	}
	.drop {
		display: grid;
		justify-items: start;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 2px dashed var(--hairline);
		border-radius: var(--radius-m);
	}
	.drop.dragging {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.drop label.btn {
		cursor: pointer;
	}
	.pending {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	.pending li {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: end;
		gap: 0.25rem 0.5rem;
	}
	.pending .field {
		min-width: 0;
	}
	.pending input {
		width: 100%;
	}
	.old {
		font-size: 0.85em;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.pending .hint {
		grid-column: 1;
		font-size: 0.85em;
		color: var(--text-muted);
	}
	.pending .hint.warn {
		color: var(--warn);
	}
	.remove {
		grid-row: 1;
		grid-column: 2;
		background: none;
		border: 0;
		padding: 0.5rem;
		cursor: pointer;
		color: inherit;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.missing summary {
		cursor: pointer;
	}
</style>
