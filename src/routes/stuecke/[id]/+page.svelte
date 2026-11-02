<script lang="ts">
	import { splitList } from '#lib/repertoire/lists.ts';
	import { enhance } from '$app/forms';
	import ConcertMode from '#lib/components/ConcertMode.svelte';
	import { offlineParts, type OfflinePart } from '#lib/offline/parts.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import ConcertRow from '#lib/components/ConcertRow.svelte';
	import Crumbs from '#lib/components/Crumbs.svelte';
	import EventRow from '#lib/components/EventRow.svelte';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import InstrumentGlyph from '#lib/components/InstrumentGlyph.svelte';
	import { partGlyph } from '#lib/music/instrument-glyph.ts';
	import ProblemReports from '#lib/components/ProblemReports.svelte';
	import PieceArt from '#lib/components/PieceArt.svelte';
	import PieceFolder from '#lib/components/PieceFolder.svelte';
	import PieceNotes from '#lib/components/PieceNotes.svelte';
	import PartAssignments from '#lib/components/PartAssignments.svelte';
	import ScanList from '#lib/components/ScanList.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const piece = $derived(data.piece);
	type Part = (typeof data.piece.parts)[number];

	const GROUP_ORDER = [
		'featured',
		'holz',
		'blech',
		'schlagwerk',
		'tasten',
		'gesang',
		'sonstige',
		'streicher',
		'other'
	] as const;
	type GroupKey = (typeof GROUP_ORDER)[number];

	const groupOf = (part: Part): GroupKey => {
		if (part.kind === 'partitur' || part.kind === 'solo') return 'featured';
		if (part.kind === 'audio' || part.kind === 'sonstiges' || !part.family || part.family === 'partitur') return 'other';
		return part.family;
	};

	// A symphony may have sections: what is played, single movements, the complete work.
	// The chosen tab belongs to one piece, so another piece opens on its own first section.
	let chosen = $state<{ piece: string; key: string } | null>(null);
	const sections = $derived(piece.sections);
	const current = $derived(
		sections.find((section) => chosen?.piece === piece.id && section.key === chosen.key) ?? sections[0]
	);
	const shown = $derived(current ? piece.parts.filter((part) => part.section === current.key) : piece.parts);

	const groups = $derived(
		GROUP_ORDER.map((key) => ({ key, parts: shown.filter((part) => groupOf(part) === key) })).filter(
			(group) => group.parts.length > 0
		)
	);

	// The piece's facts in one card under the title, each with its icon; the note reads as a line of its own.
	const FACT_ICONS: Record<Exclude<keyof typeof t.piece.info, 'notes'>, IconName> = {
		duration: 'clock',
		publisher: 'book',
		arranger: 'user',
		genre: 'tag',
		difficulty: 'gauge',
		reviewedAt: 'check',
		instrumentation: 'users',
		unscored: 'alert'
	};
	const info = $derived(
		(Object.keys(t.piece.info) as (keyof typeof t.piece.info)[])
			.filter((key) => key !== 'notes')
			.map((key) => ({ key, label: t.piece.info[key], value: piece.info[key], icon: FACT_ICONS[key as keyof typeof FACT_ICONS] }))
			.filter((item) => item.value)
	);

	// Reporting a single part opens the form with that part chosen.
	// Reported as missing but not confirmed yet: shown greyed out, there's no file.
	const reportedMissing = $derived(data.reports.open.filter((report) => report.kind === 'missing' && report.part && !report.fileId));
	let reporting = $state(false);
	let reportFile = $state('');
	const canReport = $derived(data.reports.state === 'ready');
	const reported = $derived(new Set(data.reports.open.map((report) => report.fileId).filter(Boolean)));
	const reportPart = (id: string) => {
		reportFile = id;
		reporting = true;
	};

	/** The piece's few actions as tiles under the title, like on a contact card. */
	const tiles = $derived(
		[
			piece.folderUrl && { href: piece.folderUrl, icon: 'folder' as const, label: t.piece.folder, external: true },
			piece.recording && { href: piece.recording, icon: 'headphones' as const, label: t.piece.recording, external: true },
			data.canEdit && { href: `/stuecke/${encodeURIComponent(piece.id)}/bearbeiten`, icon: 'edit' as const, label: t.piece.editShort, external: false },
			data.canPrintSet && { href: `/stuecke/${encodeURIComponent(piece.id)}/stimmensatz`, icon: 'print' as const, label: t.partSet.link, external: false }
		].filter((tile) => !!tile)
	);

	// A portrait that doesn't load (Wikimedia unreachable) gives way to the drawing.
	let portraitFailed = $state<string | null>(null);
	const portrait = $derived(portraitFailed === piece.id ? null : data.banner.portrait);

	// The member's own parts (#216): one tap from the top, and marked in the list.
	const mine = $derived(data.mine.filter((part) => part.status !== 'missing'));
	const mineIds = $derived(new Set(data.mine.map((part) => part.id)));

	const gaps = $derived(
		piece.parts.filter((part) => part.status !== 'ok' && part.kind !== 'sonstiges' && part.kind !== 'audio').length
	);

	// Any part kept on this device (#62), one at a time, opened in the app's viewer without a connection.
	$effect(() => offlineParts.start(data.features.offline));
	const canKeep = (part: Part) =>
		offlineParts.supported && data.auth === 'on' && part.mimeType === 'application/pdf' && part.status !== 'missing';
	let keeping = $state<string | null>(null);
	let keepFailed = $state(false);
	async function toggleKeep(part: Part) {
		keeping = part.id;
		keepFailed = false;
		if (offlineParts.has(part.id)) await offlineParts.remove([part.id]);
		else keepFailed = (await offlineParts.save([{ id: part.id, label: part.label, piece: piece.title, pieceId: piece.id, glyph: partGlyph(part) }])) > 0;
		keeping = null;
	}
	let viewing = $state<OfflinePart | null>(null);
	/** Offline, a saved part opens in the app's viewer: Drive and the practice page need a connection. */
	function openKept(event: MouseEvent, part: { id: string; label: string }) {
		if (offlineParts.online || !offlineParts.has(part.id)) return;
		event.preventDefault();
		viewing = { id: part.id, label: part.label, piece: piece.title };
	}
</script>

{#if viewing}<ConcertMode files={[viewing]} marks={{}} onclose={() => (viewing = null)} />{/if}

<Title title={piece.title} />

<Crumbs items={[{ href: '/stuecke', label: t.pieces.title }]} />

<!-- One card: the banner in the orchestra's colour with the composer's portrait (or a drawing for
     the genre), the facts underneath. -->
<div class="piece-card">
<header class="hero">
	{#if portrait}
		<img class="portrait" src={portrait.src} alt={t.piece.portrait(portrait.name)} onerror={() => (portraitFailed = piece.id)} />
		<a class="credit" href={portrait.source} target="_blank" rel="noopener noreferrer">{t.piece.portraitCredit}</a>
	{:else}
		<div class="art"><PieceArt art={data.banner.art} /></div>
	{/if}
	<div class="hero-text">
		{#if piece.composer || piece.catalogue}
			<p class="eyebrow">
				<!-- Each composer of a list links to all of their works. -->
				{#each splitList(piece.composer) as name, i (name)}{#if i}, {/if}<a href="/stuecke?komponist={encodeURIComponent(name)}" title={t.piece.allBy(name)}>{name}</a>{/each}
				{#if piece.composer && piece.catalogue}·{/if}
				{piece.catalogue ?? ''}
			</p>
		{/if}
		<h1>{piece.title}</h1>
		<div class="facts">
			<span>{piece.status === 'none' ? t.pieces.status.none : t.pieces.parts(piece.partCount)}</span>
			{#each piece.programs as program (program)}<span class="pill"><Icon name="music" size={14} />{program}</span>{/each}
			{#if piece.category}<span class="pill">{piece.category}</span>{/if}
		</div>
	</div>
</header>

{#if info.length}
	<dl class="details" aria-label={t.piece.details}>
		{#each info as item (item.key)}
			<!-- The icon belongs to the label, so the list keeps only labels and values (for screen readers). -->
			<div class="detail" class:warn={item.key === 'unscored'}>
				<dt><span class="detail-icon" aria-hidden="true"><Icon name={item.icon} size={18} /></span>{item.label}</dt>
				<dd>{item.value}</dd>
			</div>
		{/each}
	</dl>
{/if}
{#if mine.length}
	<div class="my-parts">
		{#each mine as part (part.id)}
			{@const external = !part.url.startsWith('/')}
			<a
				class="btn"
				class:secondary={part.shared}
				href={part.url}
				target={external ? '_blank' : undefined}
				rel={external ? 'noopener noreferrer' : undefined}
				onclick={(event) => openKept(event, part)}
			>
				<Icon name="parts" size={18} />{part.shared ? t.piece.alsoPart(part.label) : t.piece.yourPart(part.label)}
			</a>
		{/each}
	</div>
{/if}
</div>

{#if piece.info.notes || data.saved || gaps > 0}
<div class="notices">
	{#if piece.info.notes}
		<p class="piece-note"><span class="sr-only">{t.piece.info.notes}: </span>{piece.info.notes}</p>
	{/if}
	{#if data.saved}
		<p class="msg ok" role="status">
			<Icon name="check" size={16} />{t.piece.saved}
			{#if data.renamedIn}{t.pieceEditor.renamed(data.renamedIn)}{/if}
		</p>
	{/if}
	{#if gaps > 0}
		<p class="gaps"><Icon name="alert" size={16} />{t.piece.missingSummary(gaps)}</p>
	{/if}
</div>
{/if}

{#if tiles.length || canReport}
	<div class="tiles">
		{#each tiles as tile (tile.icon)}
			<a
				class="tile"
				href={tile.href}
				target={tile.external ? '_blank' : undefined}
				rel={tile.external ? 'noopener noreferrer nofollow' : undefined}
			>
				<Icon name={tile.icon} size={20} /><span>{tile.label}</span>
			</a>
		{/each}
		{#if canReport}
			<button class="tile" class:active={reporting} aria-expanded={reporting} onclick={() => (reporting = !reporting)}>
				<Icon name="flag" size={20} /><span>{t.piece.reportShort}</span>
			</button>
		{/if}
	</div>
{/if}

{#if piece.status === 'none'}
	<p class="placeholder">{t.piece.noMusic}</p>
{/if}

{#each data.loans as loan, i (i)}
	<!-- Rented music: whose it is and when it goes back, before anyone writes in it. -->
	<div class="loan {loan.state}" role="note">
		<Icon name={loan.state === 'overdue' ? 'alert' : 'loan'} size={18} />
		<p>
			<strong>{t.loans.onPiece}</strong>
			{[loan.from && t.loans.from(loan.from), loan.dueAt && t.loans.dueAt(loan.dueAt)].filter(Boolean).join(', ')}
			{#if loan.days !== undefined && loan.state !== 'open'}· {t.loans.due(loan.days)}{/if}
			<span class="loan-hint">{t.loans.onPieceHint}</span>
		</p>
		{#if data.canManageLoans}<a href="/leihmaterial">{t.loans.manage}</a>{/if}
	</div>
{/each}

<ProblemReports
	reports={data.reports.open}
	status={data.reports.state}
	canClose={data.reports.canClose}
	kinds={data.reports.kinds}
	recording={data.reports.recording}
	parts={piece.parts.filter((part) => part.status !== 'missing').map(({ id, label }) => ({ id, label }))}
	instruments={data.reports.instruments}
	common={data.reports.common}
	present={data.reports.present}
	result={form}
	trigger={false}
	bind:open={reporting}
	bind:fileId={reportFile}
/>

<PieceNotes notes={data.notes} result={form} />

<ScanList scans={data.scans} />

<PartAssignments assignments={data.assignments} result={form} />

{#if data.upcoming.length}
	<!-- Where the piece is next: the concert it's played at and the rehearsals that plan it. -->
	<section class="block">
		<h2 class="ui-label">{t.piece.upcoming}</h2>
		<ul class="ui-list">
			{#each data.upcoming as event (event.id)}
				<li><EventRow {event} /></li>
			{/each}
		</ul>
	</section>
{/if}

{#if sections.length > 1 && current}
	<div class="sections" role="tablist" aria-label={t.piece.sections}>
		{#each sections as section (section.key)}
			<button
				role="tab"
				class="section-tab"
				class:active={section.key === current.key}
				class:complete={section.kind === 'complete'}
				aria-selected={section.key === current.key}
				onclick={() => (chosen = { piece: piece.id, key: section.key })}
			>
				<span>{section.label}</span>
				{#if section.kind === 'played'}<span class="badge">{t.piece.playedBadge}</span>{/if}
				<span class="count">{section.partCount}</span>
			</button>
		{/each}
	</div>
	{#if t.piece.sectionHint[current.kind] || current.key}
		<p class="section-hint">
			{t.piece.sectionHint[current.kind]}
			{#if current.key}
				<a href={current.folderUrl} target="_blank" rel="noopener noreferrer">
					<Icon name="folder" size={14} />{t.piece.sectionFolder}
				</a>
			{/if}
		</p>
	{/if}
{/if}

{#if keepFailed}<p class="msg error" role="alert">{t.pwa.failed(1)}</p>{/if}

{#each groups as group (`${current?.key}:${group.key}`)}
	<section class="block">
		<h2 class="ui-label">{t.piece.groups[group.key]}</h2>
		<ul class="parts">
			{#each group.parts as part (part.id)}
				<li class:flagged={reported.has(part.id)}>
					<!-- A missing part is only a placeholder: nothing to open, so it isn't a link (and has no click handler). -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<svelte:element
						this={part.status === 'missing' ? 'div' : 'a'}
						class="part"
						class:with-flag={canReport && part.status !== 'missing'}
						class:with-keep={canKeep(part)}
						class:missing={part.status === 'missing'}
						href={part.status === 'missing' ? undefined : part.url}
						target={part.status === 'missing' ? undefined : '_blank'}
						rel={part.status === 'missing' ? undefined : 'noopener noreferrer'}
						title={part.fileName}
						onclick={part.status === 'missing' ? undefined : (event: MouseEvent) => openKept(event, part)}
					>
						<span class="icon">
							{#if part.kind === 'audio'}<Icon name="headphones" size={16} />{:else}<InstrumentGlyph glyph={partGlyph(part)} size={20} />{/if}
						</span>
						<span class="label">
							<span class="name">{part.label}{#if mineIds.has(part.id)}<span class="yours">{t.piece.yours}</span>{/if}{#if offlineParts.has(part.id)}<span class="yours kept">{t.pwa.offlineBadge}</span>{/if}</span>
							{#if part.notes.length || (part.subfolder && sections.length < 2)}
								<span class="notes">
									{#each part.notes as note (note)}<span class="note">{note}</span>{/each}
									<!-- With tabs, the subfolder is the tab; a lone subfolder is still worth naming. -->
									{#if part.subfolder && sections.length < 2}<span class="note">{part.subfolder}</span>{/if}
								</span>
							{/if}
						</span>
						{#if part.status !== 'ok'}
							<span class="status {part.status}">{t.piece.partStatus[part.status]}</span>
						{/if}
						{#if part.status !== 'missing'}<span class="opens-elsewhere"><Icon name="external" size={14} /></span>{/if}
					</svelte:element>
					{#if canReport && part.status !== 'missing'}
						<button
							class="flag"
							title={t.reports.reportPart(part.label)}
							aria-label={t.reports.reportPart(part.label)}
							onclick={() => reportPart(part.id)}
						>
							<Icon name="flag" size={15} />
						</button>
					{/if}
					{#if canKeep(part)}
						{@const kept = offlineParts.has(part.id)}
						<button
							class="keep"
							class:kept
							class:beside-flag={canReport}
							title={kept ? t.pwa.removePart(part.label) : t.pwa.savePart(part.label)}
							aria-label={kept ? t.pwa.removePart(part.label) : t.pwa.savePart(part.label)}
							aria-pressed={kept}
							disabled={keeping === part.id || (!kept && !offlineParts.online)}
							onclick={() => toggleKeep(part)}
						>
							<Icon name={kept ? 'check' : 'download'} size={15} />
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/each}

{#if reportedMissing.length}
	<section class="block">
		<h2 class="ui-label">{t.piece.reportedMissing}</h2>
		<ul class="parts">
			{#each reportedMissing as report (report.id)}
				<li>
					<div class="part missing" title={t.piece.reportedMissingHint}>
						<span class="icon"><Icon name="file" size={16} /></span>
						<span class="label"><span class="name">{report.part}</span></span>
						<span class="status reported">{t.gaps.reported}</span>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if piece.parts.length}<p class="hint">{t.piece.driveHint}</p>{/if}

{#if data.folder}
	<PieceFolder
		pieceId={piece.id}
		tools={data.folder}
		existing={piece.parts.filter((part) => !part.subfolder).map((part) => part.fileName)}
		instruments={data.reports.instruments}
		common={data.reports.common}
		created={data.folderCreated}
		result={form}
	/>
{/if}

<!-- Below the parts: where the piece was played, related pieces. -->

{#snippet pieceLinks(pieces: typeof data.moreByComposer)}
	<ul class="more-list">
		{#each pieces as other (other.id)}
			<li>
				<a href="/stuecke/{other.id}">
					<span class="more-title">{other.title}</span>
					{#if other.catalogue}<span class="muted">{other.catalogue}</span>{/if}
					{#each other.programs as program (program)}<span class="tag program">{program}</span>{/each}
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

<section class="block">
	<div class="played-head">
		<h2 class="ui-label">{t.piece.playedAt}</h2>
		{#if data.again}
			<form method="POST" action="?/again" use:enhance={() => async ({ update }) => update({ reset: false })}>
				<button class="again" class:mine={data.again.mine} aria-pressed={data.again.mine} title={t.piece.againHint}>
					<Icon name="heart" size={16} />{data.again.mine ? t.piece.againMine : t.piece.again}
					{#if data.again.votes}<span class="votes">{t.wishes.votes(data.again.votes)}</span>{/if}
				</button>
			</form>
		{/if}
	</div>
	{#if form?.againError}<p class="placeholder" role="alert">{form.againError}</p>{/if}
	{#if data.again?.planned}<p class="planned"><Icon name="check" size={14} />{t.piece.againPlanned}</p>{/if}
	{#if data.playedAt.length}
		<ul class="ui-list">
			{#each data.playedAt as concert (concert.id)}
				<li><ConcertRow {concert} /></li>
			{/each}
		</ul>
	{:else}
		<p class="placeholder">{data.sheet === 'ok' ? t.piece.playedAtNone : t.piece.playedAtNoSheet}</p>
	{/if}
</section>

{#if data.otherVersions.length}
	<section class="block">
		<h2 class="ui-label">{t.piece.otherVersions}</h2>
		{@render pieceLinks(data.otherVersions)}
	</section>
{/if}
{#if piece.composer && data.moreByComposer.length}
	<details class="block ui-disclosure more-by">
		<summary>{t.piece.moreBy(piece.composer)} <span class="muted">{data.moreByComposer.length}</span></summary>
		{@render pieceLinks(data.moreByComposer)}
	</details>
{/if}

<style>
	.loan {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin-bottom: var(--space-5);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-m);
		background: var(--accent-soft);
	}

	.loan.overdue {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
	}

	.loan.due-soon {
		background: color-mix(in oklab, var(--warn) 14%, transparent);
	}

	.loan :global(svg) {
		flex: none;
	}

	.loan p {
		flex: 1;
		min-width: min(100%, 220px);
	}

	.loan-hint {
		display: block;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.loan a {
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	/* The banner: the accent colour (a tinted surface in dark), deepening towards the picture on the right. */
	.piece-card {
		margin-bottom: var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	.hero {
		position: relative;
		display: grid;
		padding: var(--space-6) var(--space-5) var(--space-5);
		background: linear-gradient(115deg, var(--hero-from) 35%, var(--hero-to));
		color: var(--hero-ink);
		overflow: hidden;
	}

	/* The picture on the right, fading into the banner towards the text. */
	.portrait,
	.art {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		mask-image: linear-gradient(to right, transparent, var(--brand-ink) 50%);
	}

	/* The portrait takes the banner's colour (luminosity blend), so any portrait suits any orchestra. */
	.portrait {
		width: min(42%, 280px);
		height: 100%;
		object-fit: cover;
		object-position: 50% 20%;
		filter: grayscale(1) contrast(1.08);
		mix-blend-mode: luminosity;
		opacity: 0.9;
	}

	.art {
		display: grid;
		align-items: center;
		width: min(40%, 220px);
		padding: var(--space-4) var(--space-5) var(--space-4) 0;
		color: var(--hero-ink);
		opacity: 0.22;
	}

	.credit {
		position: absolute;
		right: var(--space-3);
		bottom: var(--space-2);
		padding: 1px 6px;
		border-radius: var(--radius-xs);
		background: color-mix(in oklab, var(--hero-to) 80%, transparent);
		color: var(--hero-ink);
		font-size: var(--text-2xs);
	}

	.credit:hover {
		text-decoration: underline;
	}

	/* Room for the picture, so a long title doesn't run into the face. */
	.hero-text {
		position: relative;
		display: grid;
		gap: var(--space-2);
		max-width: 46rem;
		padding-right: min(32%, 200px);
	}

	.hero h1 {
		margin: 0;
		color: inherit;
		text-wrap: balance;
	}

	.eyebrow {
		margin: 0;
		font-weight: 600;
		opacity: 0.92;
	}

	.eyebrow a {
		text-decoration: underline;
		text-decoration-color: color-mix(in oklab, currentColor 40%, transparent);
		text-underline-offset: 3px;
	}

	.eyebrow a:hover {
		text-decoration-color: currentColor;
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin-top: var(--space-1);
		font-size: var(--text-md);
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 12px;
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--hero-ink) 16%, transparent);
		font-size: var(--text-xs);
		font-weight: 650;
	}

	.tag {
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.tag.program {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	/* The facts under the banner, a cell each with hairlines between them, like the parts below. */
	/* Cells grow to fill their row, so a last row with fewer facts spans the whole width too. */
	.details {
		display: flex;
		flex-wrap: wrap;
		margin: 0;
	}

	/* Instruments of the Besetzung without a part (#249). */
	.detail.warn dd {
		color: var(--danger);
	}

	.detail {
		position: relative;
		display: grid;
		flex: 1 1 210px;
		align-content: center;
		gap: 1px;
		min-width: 0;
		min-height: 64px;
		padding: var(--space-3) var(--space-4) var(--space-3) calc(var(--space-4) + 36px + var(--space-3));
		box-shadow:
			0 1px 0 var(--hairline),
			1px 0 0 var(--hairline);
	}

	.detail-icon {
		position: absolute;
		top: 50%;
		left: var(--space-4);
		transform: translateY(-50%);
		display: grid;
		place-items: center;
		flex: none;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.detail dt {
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.detail dd {
		margin: 0;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.notices {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}

	.piece-note {
		max-width: 62ch;
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-m);
		background: var(--surface-2);
		color: var(--text-muted);
		white-space: pre-line;
		overflow-wrap: anywhere;
	}

	.gaps {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--warn);
		font-size: var(--text-md);
	}

	/* The piece's actions as equal tiles, like on a contact card. */
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
		gap: var(--space-2);
		max-width: 440px;
		margin-bottom: var(--space-6);
	}

	.tile {
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 6px;
		min-height: 68px;
		padding: var(--space-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
		background: var(--surface);
		box-shadow: var(--shadow);
		color: var(--accent);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
		transition:
			transform var(--fast) var(--ease),
			background var(--fast) var(--ease);
	}

	.tile span {
		color: var(--text);
		text-align: center;
	}

	.tile:hover {
		background: var(--surface-2);
	}

	.tile:active {
		transform: scale(0.96);
	}

	.tile.active {
		background: var(--accent-soft);
	}

	.block {
		margin-bottom: var(--space-6);
	}

	.sections {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
		overflow-x: auto;
		scrollbar-width: none;
	}

	.section-tab {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: var(--space-2);
		min-height: 38px;
		padding: 0 14px;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		font-size: var(--text-md);
		font-weight: 600;
		cursor: pointer;
		transition:
			background var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	/* The complete work is for looking things up, so it's quieter until chosen. */
	.section-tab.complete:not(.active) {
		color: var(--text-muted);
	}

	.section-tab.active {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.badge {
		padding: 0 6px;
		border-radius: var(--radius-xs);
		background: color-mix(in oklab, var(--ok) 18%, transparent);
		color: var(--ok);
		font-size: var(--text-2xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.section-tab.active .badge {
		background: color-mix(in oklab, var(--accent-contrast) 25%, transparent);
		color: var(--accent-contrast);
	}

	.count {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
	}

	.section-tab.active .count {
		color: color-mix(in oklab, var(--accent-contrast) 80%, transparent);
	}

	.section-hint {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		margin: 0 0 var(--space-5) var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.section-hint a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--accent);
		font-weight: 600;
	}

	/* One card per group; on wide screens the rows sit in columns, divided by hairlines. */
	.parts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	.parts li {
		position: relative;
		box-shadow:
			0 1px 0 var(--hairline),
			1px 0 0 var(--hairline);
	}

	.part {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 54px;
		height: 100%;
		padding: var(--space-2) var(--space-4);
		transition: background var(--fast) var(--ease);
	}

	a.part:hover {
		background: var(--surface-2);
	}

	.part.with-flag,
	.part.with-keep {
		padding-right: 48px;
	}

	.part.with-flag.with-keep {
		padding-right: 88px;
	}

	/* Keeping the part on the device (#62): left of the flag, green once it's there. */
	.keep {
		position: absolute;
		top: 50%;
		right: 8px;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
		transform: translateY(-50%);
		opacity: 0.75;
		transition:
			opacity var(--fast) var(--ease),
			background var(--fast) var(--ease);
	}

	.keep.beside-flag {
		right: 46px;
	}

	li:hover .keep,
	.keep:focus-visible {
		opacity: 1;
	}

	.keep:hover {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.keep.kept {
		color: var(--ok);
		opacity: 1;
	}

	.keep:disabled {
		cursor: default;
		opacity: 0.4;
	}

	.yours.kept {
		background: color-mix(in oklab, var(--ok) 14%, transparent);
		color: var(--ok);
	}

	.flag {
		position: absolute;
		top: 50%;
		right: 8px;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
		transform: translateY(-50%);
		/* Quiet, but still 3:1 against the row (#141). */
		opacity: 0.75;
		transition:
			opacity var(--fast) var(--ease),
			background var(--fast) var(--ease);
	}

	li:hover .flag {
		opacity: 1;
	}

	.flag:hover,
	.flag:focus-visible,
	.flagged .flag {
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
		opacity: 1;
	}

	.flagged .part {
		background: color-mix(in oklab, var(--warn) 6%, transparent);
	}

	.part.missing {
		color: var(--text-muted);
		cursor: default;
	}

	.icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-s);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.part.missing .icon {
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.label {
		display: grid;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.notes {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.note {
		padding: 0 6px;
		border-radius: var(--radius-xs);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
	}

	.my-parts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding: var(--space-4);
		border-top: 1px solid var(--hairline);
	}

	.yours {
		margin-left: var(--space-2);
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-2xs);
		font-weight: 650;
		vertical-align: 1px;
	}

	.status {
		flex: none;
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		font-size: var(--text-2xs);
		font-weight: 600;
		color: var(--warn);
		background: color-mix(in oklab, var(--warn) 14%, transparent);
	}

	.status.missing {
		color: var(--danger);
		background: color-mix(in oklab, var(--danger) 12%, transparent);
	}

	.opens-elsewhere {
		display: grid;
		flex: none;
		color: var(--text-muted);
		opacity: 0;
		transition: opacity var(--fast) var(--ease);
	}

	.part:hover .opens-elsewhere,
	.part:focus-visible .opens-elsewhere {
		opacity: 1;
		color: var(--accent);
	}

	/* No hover on touch screens: the hint that a part opens elsewhere stays visible. */
	@media (hover: none) {
		.opens-elsewhere {
			opacity: 0.75;
		}
	}

	.placeholder {
		margin-bottom: var(--space-5);
		padding: var(--space-4) var(--space-5);
		border: 1px dashed var(--border);
		border-radius: var(--radius-l);
		color: var(--text-muted);
	}

	.hint {
		margin: calc(-1 * var(--space-4)) var(--space-1) var(--space-7);
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.played-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	.played-head .ui-label {
		margin-bottom: 0;
	}

	.again {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 36px;
		padding: 0 var(--space-3);
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		transition:
			background var(--fast) var(--ease),
			transform var(--fast) var(--ease);
	}

	.again:active {
		transform: scale(0.96);
	}

	.again.mine {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.again .votes {
		color: var(--text-muted);
		font-weight: 700;
	}

	.planned {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
		color: var(--ok);
		font-size: var(--text-sm);
	}

	.more-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.more-list a {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		height: 100%;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
		background: var(--surface);
		transition: background var(--fast) var(--ease);
	}

	.more-list a:hover {
		background: var(--surface-2);
	}

	.more-title {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 400;
	}

	.more-by[open] summary {
		margin-bottom: var(--space-3);
	}
</style>
