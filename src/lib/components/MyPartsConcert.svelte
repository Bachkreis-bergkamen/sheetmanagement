<script lang="ts">
	import { page as app } from '$app/state';
	import { t } from '#lib/i18n/index.ts';
	import { mergedFileName } from '#lib/music/my-parts.ts';
	import { offlineParts } from '#lib/offline/parts.svelte.ts';
	import type { Stroke } from '#lib/practice/marks.ts';
	import type { PageData } from '../../routes/meine-noten/$types';
	import ConcertMode from './ConcertMode.svelte';
	import Icon from './Icon.svelte';
	import InstrumentGlyph from './InstrumentGlyph.svelte';
	import QuickReport from './QuickReport.svelte';

	/** One concert on "Meine Noten": its programme with the member's parts, and the merged PDF. */
	let {
		concert,
		label,
		canMerge
	}: {
		concert: PageData['concerts'][number];
		/** What the member plays, e.g. "Geige I & II, Viola"; empty before they picked. */
		label: string;
		canMerge: boolean;
	} = $props();

	type Piece = (typeof concert.pieces)[number];
	type Match = Piece['matches'][number];
	type Shown = Match['own'][number];
	/** Per instrument: its own parts, or the shared ones when there is no own part. */
	const playable = (match: Match): Shown[] => {
		const ok = (parts: Shown[]) => parts.filter((part) => part.pdf && part.status === 'ok');
		return ok(match.own).length ? ok(match.own) : ok(match.shared);
	};
	const hasPart = (match: Match) => match.own.length > 0 || match.shared.length > 0;
	/** Per piece, the parts of every instrument; a part two instruments share only once. */
	const files = $derived(
		concert.pieces.flatMap((piece) => {
			const parts = piece.matches.flatMap(playable).filter((part, i, all) => all.findIndex((p) => p.id === part.id) === i);
			return parts.map((part) => ({ ...part, piece: piece.title, pieceId: piece.pieceId ?? undefined }));
		})
	);
	const found = $derived(concert.pieces.filter((piece) => piece.matches.some(hasPart)).length);
	const several = $derived(concert.pieces.some((piece) => piece.matches.length > 1));

	// The concert mode (#194), opened by a tap so it may go full screen; the member's marks come along.
	let performing = $state<Record<string, Record<number, Stroke[]>> | null>(null);
	async function perform() {
		performing = {};
		const marks = await ownMarks(files.map((file) => file.id));
		if (performing) performing = marks;
	}

	/** Reporting a problem with a part, or a part that's missing, from here (#306); signed in only. */
	const canReport = $derived(!!app.data.user);
	let reporting = $state<{ pieceId: string; fileId?: string; part: string; missing?: { instrument: string; number?: number } } | null>(null);

	let progress = $state<string | null>(null);
	let mergeError = $state<string | null>(null);
	/** Parts left out of the last merge, and why, so a broken file can be found and fixed. */
	let skipped = $state<{ piece: string; label: string; reason: string }[]>([]);

	/** The part's pages, or why it couldn't be added. */
	async function loadPart(PDFDocument: typeof import('@cantoo/pdf-lib').PDFDocument, id: string) {
		let response: Response;
		try {
			response = await fetch(`/api/noten/${encodeURIComponent(id)}`);
		} catch {
			return { reason: t.myParts.skipOffline };
		}
		if (!response.ok) {
			const body = await response.text().catch(() => '');
			let message = '';
			try {
				message = JSON.parse(body).message ?? '';
			} catch {
				// Not SvelteKit's JSON error, e.g. a Cloudflare error page: the status says enough.
			}
			return { reason: t.myParts.skipHttp(response.status, message) };
		}
		try {
			// Some publishers' PDFs are encrypted without a password (copy protection only); the
			// empty password decrypts them, otherwise their pages can't be read (#80).
			return { doc: await PDFDocument.load(await response.arrayBuffer(), { password: '' }) };
		} catch (error) {
			console.error(error);
			return { reason: t.myParts.skipUnreadable };
		}
	}

	// Offline in the rehearsal hall (#62): the parts saved in the service worker's cache, opened
	// from there while there's no connection; off for orchestras that don't use it (#134).
	const supported = $derived(offlineParts.supported);
	const online = $derived(offlineParts.online);
	let saving = $state<string | null>(null);
	let saveFailed = $state(0);
	const savedHere = $derived(files.filter((file) => offlineParts.has(file.id)).length);

	$effect(() => offlineParts.start(app.data.features.offline));

	async function saveOffline() {
		saveFailed = await offlineParts.save(
			files.map((file) => ({ id: file.id, label: file.label, piece: file.piece, pieceId: file.pieceId, glyph: file.glyph })),
			(done, total) => (saving = t.pwa.saving(done, total))
		);
		saving = null;
	}

	const removeOffline = () => offlineParts.remove(files.map((file) => file.id));

	/** Online the usual place (the viewer); offline the kept copy, in the viewer when its page is kept too. */
	const partHref = (part: { id: string; url: string }) => (!online && offlineParts.has(part.id) ? offlineParts.offlineHref(part.id) : part.url);

	/** The practice viewer is a page of the app: it opens in place, not in a new tab or window. */
	const inApp = (href: string) => href.startsWith('/ueben/');

	/** The member's notes in these parts, by file and page; none when they can't be loaded. */
	async function ownMarks(ids: string[]): Promise<Record<string, Record<number, Stroke[]>>> {
		try {
			const response = await fetch(`/api/ueben/notizen?dateien=${ids.map(encodeURIComponent).join(',')}`);
			return response.ok ? await response.json() : {};
		} catch {
			return {};
		}
	}

	/** Merges the parts in the browser: Workers on the free plan have too little CPU time for it. */
	async function merge() {
		if (!label) return;
		mergeError = null;
		skipped = [];
		try {
			progress = t.myParts.merging(0, files.length);
			const [{ PDFDocument }, { drawMarks }] = await Promise.all([import('@cantoo/pdf-lib'), import('#lib/practice/marks-pdf.ts')]);
			const merged = await PDFDocument.create();
			// The member's own notes from the practice viewer go onto their pages; without them, the parts as they are.
			const marks = await ownMarks(files.map((file) => file.id));
			// One broken file shouldn't cost the whole PDF: it's left out and named.
			for (const [i, file] of files.entries()) {
				progress = t.myParts.merging(i + 1, files.length);
				const part = await loadPart(PDFDocument, file.id);
				if (!part.doc) {
					skipped.push({ piece: file.piece, label: file.label, reason: part.reason });
					continue;
				}
				try {
					for (const [index, page] of (await merged.copyPages(part.doc, part.doc.getPageIndices())).entries()) {
						merged.addPage(page);
						await drawMarks(page, marks[file.id]?.[index + 1]);
					}
				} catch (error) {
					console.error(error);
					skipped.push({ piece: file.piece, label: file.label, reason: t.myParts.skipUnreadable });
				}
			}
			if (merged.getPageCount() === 0) {
				mergeError = t.myParts.mergeFailed;
				return;
			}
			const blob = new Blob([(await merged.save()) as BlobPart], { type: 'application/pdf' });
			const link = document.createElement('a');
			link.href = URL.createObjectURL(blob);
			link.download = mergedFileName(concert.title, label);
			link.click();
			setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
		} catch (error) {
			// Loading the PDF library failed (offline, or an old cached page after a deploy).
			console.error(error);
			mergeError = `${t.myParts.mergeFailed} ${error instanceof Error ? `(${error.message})` : ''}`;
		} finally {
			progress = null;
		}
	}
</script>

{#if performing}<ConcertMode {files} marks={performing} onclose={() => (performing = null)} />{/if}

<section class="concert" id="konzert-{concert.id}">
	<div class="concert-head">
		<div>
			<!-- The concert's page (programme, rehearsals, sign-up) is one tap away. -->
			<h2><a class="concert-title" href="/kalender/{encodeURIComponent(concert.id)}">{concert.title}<Icon name="chevron" size={18} /></a></h2>
			{#if concert.label}<p class="muted">{concert.label}</p>{/if}
		</div>
		{#if label && concert.pieces.length}
			<div class="merge">
				{#if canMerge && files.length}
					<button class="btn" onclick={perform} title={t.myParts.concertMode.hint}><Icon name="eye" size={16} />{t.myParts.concertMode.open}</button>
				{/if}
				{#if canMerge}
					<button class="btn secondary" onclick={merge} disabled={!!progress || !files.length} title={t.myParts.mergeHint}>
						<Icon name="file" size={16} />{progress ?? t.myParts.merge}
					</button>
				{:else}
					<span class="muted small">{t.myParts.mergeOff}</span>
				{/if}
				{#if canMerge && supported && files.length}
					<button class="btn ghost" onclick={saveOffline} disabled={!!saving || !online} title={t.pwa.hint}>
						<Icon name="download" size={16} />{saving ?? (savedHere ? t.pwa.update : t.pwa.save)}
					</button>
				{/if}
				<span class="muted small">{t.myParts.summary(found, concert.pieces.length)}</span>
			</div>
		{/if}
	</div>
	{#if savedHere}
		<p class="offline-note">
			<Icon name="check" size={14} />{t.pwa.saved(savedHere)}
			{#if online}<button class="link" onclick={removeOffline}>{t.pwa.remove}</button>{/if}
		</p>
	{/if}
	{#if saveFailed}<p class="msg error" role="alert">{t.pwa.failed(saveFailed)}</p>{/if}
	{#if concert.note}<p class="msg info">{concert.note}</p>{/if}
	{#if mergeError}<p class="msg error" role="alert">{mergeError}</p>{/if}
	{#if skipped.length}
		<div class="msg error skipped" role="alert">
			<p>{t.myParts.skipped(skipped.length)}</p>
			<ul>
				{#each skipped as part, i (i)}<li><strong>{part.piece}</strong> – {part.label}: {part.reason}</li>{/each}
			</ul>
		</div>
	{/if}

	{#if !concert.pieces.length}
		<p class="msg info">{t.myParts.noProgram}</p>
	{:else}
		<ol class="pieces">
			{#each concert.pieces as piece, i (i)}
				<li class="piece" class:none={label && !piece.matches.some(hasPart)}>
					<span class="position">{piece.position ?? i + 1}</span>
					<div class="body">
						<!-- The Hörbeispiel always follows the piece's name; composers get a line of their own below. -->
						<div class="heading">
							<div class="title">
								{#if piece.pieceId}
									<a href="/stuecke/{encodeURIComponent(piece.pieceId)}">{piece.title}</a>
								{:else}{piece.title}{/if}
								{#if piece.recording}
									<a class="listen" href={piece.recording} target="_blank" rel="noopener noreferrer nofollow" title={t.piece.recording}>
										<Icon name="headphones" size={14} />{t.piece.recording}
									</a>
								{/if}
							</div>
							{#if piece.subtitle}<span class="subtitle muted">{piece.subtitle}</span>{/if}
						</div>
						{#if piece.notes.length}
							<!-- Agreed in rehearsal (#125): cuts and repeats right where the part is opened. -->
							<ul class="piece-notes" aria-label={t.pieceNotes.inMyParts}>
								{#each piece.notes as note, n (n)}
									<li><Icon name="note" size={14} /><span>{note.text}{#if note.section}<span class="muted">{` · ${note.section}`}</span>{/if}</span></li>
								{/each}
							</ul>
						{/if}
						{#if !piece.hasMusic}
							<span class="hint">{t.myParts.noMusic}</span>
						{:else}
							{#each piece.matches as match (match.label)}
								<div class="match">
									{#if several || match.assigned}<span class="instrument">{match.label}{#if match.assigned}<span class="tag">{t.partAssignments.assigned}</span>{/if}</span>{/if}
									{#if hasPart(match)}
										<ul class="parts">
											{#each [...match.own.map((p) => ({ ...p, shared: false })), ...match.shared.map((p) => ({ ...p, shared: true }))] as part (part.id)}
												<li>
													<!-- A missing part is only a placeholder: nothing to open. -->
													<svelte:element
														this={part.status === 'missing' ? 'span' : 'a'}
														class="part"
														class:problem={part.status !== 'ok'}
														class:missing={part.status === 'missing'}
														href={part.status === 'missing' ? undefined : partHref(part)}
														target={part.status === 'missing' || inApp(partHref(part)) ? undefined : '_blank'}
														rel={part.status === 'missing' || inApp(partHref(part)) ? undefined : 'noopener noreferrer'}
													>
														<InstrumentGlyph glyph={part.glyph} size={18} />
														<span>{part.status === 'missing' ? part.label : t.myParts.open(part.label)}</span>
														{#if part.shared}<span class="tag">{t.myParts.shared}</span>{/if}
														{#if part.status !== 'ok'}<span class="tag warn">{t.piece.partStatus[part.status]}</span>{/if}
														{#each part.notes as note (note)}<span class="tag">{note}</span>{/each}
														{#if offlineParts.has(part.id)}<span class="tag ok">{t.pwa.offlineBadge}</span>{/if}
													</svelte:element>
													{#if canReport && piece.pieceId}
														<button
															type="button"
															class="flag"
															title={t.reports.reportPart(part.label)}
															aria-label={t.reports.reportPart(part.label)}
															onclick={() => (reporting = { pieceId: piece.pieceId!, fileId: part.id, part: part.label })}><Icon name="flag" size={14} /></button
														>
													{/if}
												</li>
											{/each}
										</ul>
									{:else}
										<span class="hint warn"
											><Icon name="alert" size={14} />{t.myParts.noPart(match.label)}
											{#if canReport && piece.pieceId}
												<button
													type="button"
													class="link"
													onclick={() => (reporting = { pieceId: piece.pieceId!, part: match.label, missing: { instrument: match.instrument, number: match.number } })}
													>{t.reports.flag}</button
												>
											{/if}
										</span>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>

{#if reporting}
	{#key reporting}
		<QuickReport {...reporting} open onclose={() => (reporting = null)} />
	{/key}
{/if}

<style>
	.offline-note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: calc(-1 * var(--space-2)) 0 var(--space-3);
		color: var(--ok);
		font-size: var(--text-sm);
	}

	.offline-note .link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-muted);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	.tag.ok {
		background: color-mix(in oklab, var(--ok) 14%, transparent);
		color: var(--ok);
	}

	.concert {
		scroll-margin-top: calc(var(--header-height) + var(--space-4));
	}

	.concert-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.concert-title {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: 600;
		transition: color var(--fast) var(--ease);
	}

	.concert-title :global(svg) {
		color: var(--text-muted);
		transition: transform var(--fast) var(--ease);
	}

	.concert-title:hover {
		color: var(--accent);
	}

	.concert-title:hover :global(svg) {
		transform: translateX(2px);
		color: var(--accent);
	}

	/* The two buttons side by side, the count under them. */
	.merge {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	.merge .small {
		flex-basis: 100%;
		text-align: right;
	}

	/* On phones under the title, full width: two equal buttons instead of a ragged column. */
	@media (max-width: 560px) {
		.merge {
			width: 100%;
		}

		.merge .btn {
			flex: 1 1 0;
			justify-content: center;
		}

		.merge .small {
			text-align: left;
		}
	}

	.msg {
		margin-bottom: var(--space-4);
	}

	.skipped {
		display: grid;
		gap: var(--space-1);
	}

	.skipped ul {
		margin: 0;
		padding-left: var(--space-4);
		font-size: var(--text-sm);
	}

	.piece-notes {
		display: grid;
		gap: 4px;
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-m);
		background: var(--accent-soft);
		list-style: none;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.piece-notes li {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		overflow-wrap: anywhere;
	}

	.piece-notes :global(svg) {
		flex: none;
		translate: 0 2px;
		color: var(--accent);
	}

	.piece-notes .muted {
		font-weight: 400;
	}

	/* The programme as one card, a hairline between pieces. */
	.pieces {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	.piece {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-4);
	}

	.piece + .piece {
		border-top: 1px solid var(--hairline);
	}

	.piece.none {
		background: color-mix(in oklab, var(--surface-2) 50%, transparent);
	}

	.piece.none .title {
		color: var(--text-muted);
	}

	.position {
		display: grid;
		place-items: center;
		flex: none;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.body {
		display: grid;
		gap: var(--space-2);
		flex: 1;
		min-width: 0;
	}

	.title {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
		font-weight: 600;
	}

	.heading {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.subtitle {
		font-size: var(--text-md);
	}

	.title a:hover {
		color: var(--accent);
	}

	.title .listen {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--accent);
		font-size: var(--text-xs);
	}

	.match {
		display: grid;
		gap: var(--space-1);
	}

	.instrument {
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.instrument .tag {
		margin-left: var(--space-1);
		background: var(--accent-soft);
		color: var(--accent);
		letter-spacing: 0;
		text-transform: none;
	}

	.parts li {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}

	/* Reporting a problem with the part (#306): quiet, beside it. */
	.flag {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.flag:hover {
		background: var(--surface-2);
		color: var(--accent);
	}

	.hint .link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.parts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.part {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		min-height: 38px;
		padding: 6px var(--space-3);
		border: 1px solid transparent;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-md);
		font-weight: 600;
		transition:
			background var(--fast) var(--ease),
			transform var(--fast) var(--ease);
	}

	a.part:active {
		transform: scale(0.97);
	}

	.part.missing {
		opacity: 0.7;
		cursor: default;
	}

	a.part:hover {
		background: color-mix(in oklab, var(--accent) 24%, transparent);
	}

	.part.problem {
		border: 1px dashed var(--border);
		background: none;
		color: var(--text-muted);
	}

	.tag {
		padding: 0 6px;
		border-radius: var(--radius-xs);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.tag.warn,
	.hint.warn {
		color: var(--warn);
	}

	.hint {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.muted {
		color: var(--text-muted);
		font-weight: 400;
	}

	.small {
		font-size: var(--text-xs);
	}
</style>
