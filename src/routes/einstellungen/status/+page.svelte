<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';
	import { REPOSITORY, versionLabel, versionUrl } from '#lib/version.ts';

	let { data, form } = $props();

	const rows = $derived([
		{ label: t.status.account, check: data.checks.account },
		{ label: t.status.drive, check: data.checks.drive },
		{ label: t.status.calendar, check: data.checks.calendar },
		{ label: t.status.sheet, check: data.checks.sheet },
		{ label: t.status.signIn, check: data.checks.signIn },
		{ label: t.status.look, check: data.checks.look },
		{ label: t.status.jobs, check: data.checks.jobs },
		{ label: t.status.store, check: data.checks.store },
		{ label: t.status.errors, check: data.checks.errors, id: 'fehler' },
		{ label: t.status.push, check: data.checks.push },
		{ label: t.email.status, check: data.checks.mail },
		{ label: t.status.version, check: data.checks.version }
	]);

	// Back from Google's consent page (#123), or after disconnecting.
	const mailResults: Record<string, string> = {
		verbunden: t.email.connectedNow,
		erlaubnis: t.email.noScope,
		recht: t.email.wrongUser,
		abgebrochen: t.email.connectFailed,
		abgelaufen: t.email.connectFailed,
		fehler: t.email.connectFailed
	};
	const driveResults: Record<string, string> = {
		verbunden: t.driveAccount.connectedNow,
		erlaubnis: t.driveAccount.noScope,
		recht: t.driveAccount.wrongUser,
		abgebrochen: t.driveAccount.connectFailed,
		abgelaufen: t.driveAccount.connectFailed,
		fehler: t.driveAccount.connectFailed
	};
	const driveResult = $derived(
		form && 'driveDisconnected' in form ? t.driveAccount.disconnectedNow : data.drive?.result ? driveResults[data.drive.result] : ''
	);
	const mailResult = $derived(form && 'mailDisconnected' in form ? t.email.disconnectedNow : data.mail.result ? mailResults[data.mail.result] : '');

	const icons: Record<string, IconName> = { ok: 'check', error: 'alert', missing: 'minus' };
	// One row per page, a column per role, most opened first (#185).
	const pageRows = $derived.by(() => {
		const rows = new Map<string, { route: string; mitglied: number; verwaltung: number; gast: number }>();
		for (const count of data.pages ?? []) {
			const row = rows.get(count.route) ?? { route: count.route, mitglied: 0, verwaltung: 0, gast: 0 };
			row[count.role] += count.views;
			rows.set(count.route, row);
		}
		return [...rows.values()].sort((a, b) => b.mitglied + b.verwaltung + b.gast - (a.mitglied + a.verwaltung + a.gast));
	});
	const hasGuests = $derived(pageRows.some((row) => row.gast > 0));
	const missingExtras = $derived(data.extras.filter((extra) => extra.state !== 'on'));
	const setUpExtras = $derived(data.extras.filter((extra) => extra.state === 'on').map((extra) => t.status.extraNames[extra.key]));
</script>

<Title title={t.status.title} />
<PageHeader title={t.status.title} lead={t.status.lead} />

<ul class="checks">
	{#each rows as { label, check, id } (label)}
		<li class="check {check.state}" {id}>
			<span class="icon"><Icon name={icons[check.state]} size={18} /></span>
			<div class="body">
				<div class="head">
					<strong>{label}</strong>
					<span class="pill">{check.pill ?? t.status[check.state]}</span>
				</div>
				{#each check.details as detail (detail)}<p>{detail}</p>{/each}
				{#if check.problem}<p class="problem">{check.problem}</p>{/if}
				{#if check.hint}<p class="hint">{check.hint}</p>{/if}
				{#if id === 'fehler' && check.pill}
					<form method="POST" action="?/clearErrors">
						<button class="button secondary" type="submit">{t.status.errorsClear}</button>
					</form>
				{/if}
				{#if check.link}
					<a class="link external" href={check.link.href} target="_blank" rel="noopener noreferrer">{check.link.label}<Icon name="external" size={14} /></a>
				{/if}
			</div>
		</li>
	{/each}
</ul>

{#if data.mail.canConnect}
	<!-- The account that sends email (#123): connected through Google's consent page, as an admin. -->
	<div class="actions mail">
		<a class="button" class:secondary={data.mail.connected} href="/auth/login?zweck=mail" data-sveltekit-reload>
			<Icon name="mail" size={16} />
			{t.email.connect}
		</a>
		{#if data.mail.connected}
			<form method="POST" action="?/disconnectMail" onsubmit={(event) => confirm(t.email.confirmDisconnect) || event.preventDefault()}>
				<button class="button secondary" type="submit">{t.email.disconnect}</button>
			</form>
		{/if}
	</div>
{/if}
{#if form && 'errorsCleared' in form}
	<p class="result" role="status">{t.status.errorsCleared}</p>
{/if}
{#if mailResult}
	<p class="result" class:problem={data.mail.result !== null && data.mail.result !== 'verbunden' && !(form && 'mailDisconnected' in form)} role="status">{mailResult}</p>
{/if}

{#if data.drive}
	<!-- The account new uploads belong to (#193): the service account has no storage of its own. -->
	<section class="drive-account">
		<p class="hint">{data.drive.account ? t.driveAccount.connected(data.drive.account.email) : t.driveAccount.lead}</p>
		<div class="actions mail">
			<a class="button" class:secondary={!!data.drive.account} href="/auth/login?zweck=drive" data-sveltekit-reload>
				<Icon name="folder" size={16} />
				{t.driveAccount.connect}
			</a>
			{#if data.drive.account}
				<form method="POST" action="?/disconnectDrive" onsubmit={(event) => confirm(t.driveAccount.confirmDisconnect) || event.preventDefault()}>
					<button class="button secondary" type="submit">{t.driveAccount.disconnect}</button>
				</form>
			{/if}
		</div>
		{#if driveResult}
			<p class="result" class:problem={data.drive.result !== null && data.drive.result !== 'verbunden' && !(form && 'driveDisconnected' in form)} role="status">{driveResult}</p>
		{/if}
	</section>
{/if}

<!-- Optional services this deployment doesn't have yet, each with its part of the guide. -->
<section class="extras" aria-labelledby="extras-title">
	<h2 id="extras-title">{t.status.extras}</h2>
	{#if missingExtras.length}
		<p class="hint">{t.status.extrasLead}</p>
		<ul>
			{#each missingExtras as extra (extra.key)}
				<li>
					<div class="head">
						<strong>{t.status.extraNames[extra.key]}</strong>
						{#if extra.state === 'planned'}<span class="pill">{t.status.extraPlanned}</span>{/if}
					</div>
					<p>{t.status.extraWhat[extra.key]}</p>
					<a class="link" href={extra.guide} target="_blank" rel="noopener">{t.status.extraGuide}<Icon name="external" size={14} /></a>
				</li>
			{/each}
		</ul>
	{:else}
		<p>{t.status.extrasAllOn}</p>
	{/if}
	{#if setUpExtras.length}<p class="hint">{t.status.extrasOn(setUpExtras.join(', '))}</p>{/if}
</section>

<!-- The page audit (#185): which pages are opened, by whom as a role, never by name. -->
{#if data.pages}
	<details class="pages">
		<summary><h2>{t.status.pages.title}</h2></summary>
		<p class="hint">{t.status.pages.lead}</p>
		{#if pageRows.length}
			<div class="table-wrap">
				<table>
					<thead>
						<tr><th scope="col">{t.status.pages.route}</th><th scope="col">{t.status.pages.roles.mitglied}</th><th scope="col">{t.status.pages.roles.verwaltung}</th>{#if hasGuests}<th scope="col">{t.status.pages.roles.gast}</th>{/if}</tr>
					</thead>
					<tbody>
						{#each pageRows as row (row.route)}
							<tr><th scope="row"><code>{row.route}</code></th><td>{row.mitglied}</td><td>{row.verwaltung}</td>{#if hasGuests}<td>{row.gast}</td>{/if}</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p>{t.status.pages.none}</p>
		{/if}
	</details>
{/if}

<div class="actions">
	{#if data.checks.drive.state === 'ok'}
		<a class="button" href="?refresh" data-sveltekit-reload>
			<Icon name="refresh" size={16} />
			{t.status.refresh}
		</a>
	{/if}
	{#each data.jobs as job (job)}
		<form method="POST" action="?/runJob">
			<input type="hidden" name="job" value={job} />
			<button class="button secondary" type="submit">
				<Icon name="refresh" size={16} />
				{t.status.runJob(t.status.jobNames[job])}
			</button>
		</form>
	{/each}
	{#if data.checks.account.state === 'ok'}
		<a class="link" href="/einstellungen/tabelle">{t.status.setupSheet}</a>
		<a class="link" href="/einstellungen/tabelle/datenbank">{t.status.dataMove}</a>
	{/if}
	<a class="link" href="{REPOSITORY}/blob/main/docs/setup-google.md">{t.status.setupGuide}</a>
</div>
{#if form?.job}
	<p class="result" class:problem={!form.ok} role="status">{t.status.jobNames[form.job]}: {form.summary}</p>
{/if}
<p class="version">
	<a href={versionUrl()} target="_blank" rel="noopener noreferrer">{t.nav.appName} {versionLabel()}</a>
</p>

<style>
	.pages {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-6);
	}

	.pages summary {
		cursor: pointer;
	}

	.pages h2 {
		display: inline;
		margin: 0;
		font-size: var(--text-lg);
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	th,
	td {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--hairline);
		text-align: right;
	}

	th[scope='row'],
	thead th:first-child {
		text-align: left;
		font-weight: 500;
	}

	.extras {
		/* The pill's colour: neutral, it's not an error. */
		--state: var(--text-muted);
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-6);
	}

	.extras h2 {
		margin: 0;
		font-size: var(--text-lg);
	}

	.extras p {
		margin: 0;
	}

	.extras ul {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.extras li {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--surface);
	}

	.extras li p {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.extras .link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		justify-self: start;
		font-size: var(--text-sm);
	}

	.version {
		margin-top: var(--space-5);
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.version a {
		color: inherit;
	}

	.link.external {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		justify-self: start;
		font-size: var(--text-sm);
	}

	.checks {
		display: grid;
		gap: var(--space-3);
		margin: 0 0 var(--space-5);
		padding: 0;
		list-style: none;
	}

	.check {
		--state: var(--text-muted);
		display: flex;
		gap: var(--space-4);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.check.ok {
		--state: var(--ok);
	}

	.check.error {
		--state: var(--danger);
	}

	.icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-pill);
		color: var(--state);
		background: color-mix(in oklab, var(--state) 14%, transparent);
	}

	.body {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.pill {
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		font-size: var(--text-2xs);
		font-weight: 600;
		color: var(--state);
		background: color-mix(in oklab, var(--state) 12%, transparent);
	}

	p {
		color: var(--text-muted);
		font-size: var(--text-md);
		overflow-wrap: anywhere;
	}

	.problem {
		color: var(--text);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4);
	}

	.button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 600;
	}

	.button.secondary {
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.result {
		margin-top: var(--space-4);
	}

	.actions.mail {
		margin-top: var(--space-4);
	}

	.link {
		color: var(--accent);
		font-weight: 500;
	}
</style>
