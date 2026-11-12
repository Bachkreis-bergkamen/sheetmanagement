<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import { Copier } from '#lib/clipboard.svelte.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import MemberFields from '#lib/components/MemberFields.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import PasswordFields from '#lib/components/PasswordFields.svelte';
	import PracticeTime from '#lib/components/PracticeTime.svelte';
	import PushSettings from '#lib/components/PushSettings.svelte';
	import TextSize from '#lib/components/TextSize.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import Title from '#lib/components/Title.svelte';
	import { startTour } from '#lib/tour/state.svelte.ts';
	import { install } from '#lib/install/state.svelte.ts';

	let { data, form } = $props();
	const saving = new FormState();
	const name = $derived(data.member?.name || data.user?.name || '');
	const feeds = new FormState();
	const mails = new FormState();
	const passwords = new FormState();
	const links = new FormState();
	/** Other accounts kept on this device, to switch to. */
	const others = $derived((data.accounts ?? []).filter((account) => account.email.toLowerCase() !== data.email.toLowerCase()));
	const linkConfirm =$derived(data.accessLink?.viaLink ? t.ownLink.confirmRenewViaLink : t.ownLink.confirmRenew);

	/** Notifications, email reminders and the calendar link: the group shows when one of them is set up. */
	const showNotify = $derived(!!(data.member && (data.push || data.mail || data.feed)));
	/** The page's groups, for the links at the top; only the ones shown. */
	const groups = $derived(
		[
			data.member ? { id: 'ueber-dich', label: t.profile.sections.about } : null,
			showNotify ? { id: 'hinweise', label: t.profile.sections.notify } : null,
			{ id: 'app', label: t.profile.sections.app },
			{ id: 'daten', label: t.profile.sections.practice },
			{ id: 'anmeldung', label: t.profile.sections.signIn }
		].filter((group) => group !== null)
	);

	// Without a clipboard the field below is selectable.
	const copier = new Copier();
</script>

<Title title={t.profile.title} />
<PageHeader title={t.profile.title} lead={t.profile.lead} />

<div class="stack">
	<!-- Who is signed in, and where their choices show up. -->
	<section class="ui-card account">
		<Avatar {name} instrument={data.user?.instrument} size={52} />
		<div class="who">
			<strong>{name}</strong>
			<span>{data.email}</span>
		</div>
		<a class="btn secondary" href="/meine-noten"><Icon name="parts" size={16} />{t.nav.myParts}</a>
	</section>

	<!-- The topics below, to jump to on a long page. -->
	<nav class="jump" aria-label={t.profile.sections.jump}>
		{#each groups as group (group.id)}<a href="#{group.id}">{group.label}</a>{/each}
	</nav>

	{#if !data.member}
		<p class="msg info">{t.profile.notMember}</p>
	{:else}
		<!-- About you: the member's own row in "Mitglieder". -->
		<section class="group" id="ueber-dich" aria-labelledby="ueber-dich-title">
			<header>
				<h2 id="ueber-dich-title">{t.profile.sections.about}</h2>
				<p>{t.profile.sections.aboutLead}</p>
			</header>
			<form class="ui-card card" method="POST" action="?/save" use:enhance={saving.submit()} data-tour="profile">
				<!-- Rebuilt after saving, so the form shows what's in the sheet now. -->
				{#key JSON.stringify(data.member)}
					<MemberFields member={data.member} instruments={data.instruments} common={data.common} orchestras={data.orchestras} nameOnly={data.member.status === 'eltern'} />
				{/key}

				{#if data.member.groups.length}
					<p class="roles">
						<span class="muted">{t.profile.groups}</span>
						{#each data.member.groups as group (group)}<span class="tag">{group}</span>{/each}
						<span class="muted small">{t.profile.groupsHint}</span>
					</p>
				{/if}

				{#if form?.message}<p class="msg error" role="alert">{form.message}</p>{/if}
				<div class="actions">
					<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{t.profile.save}</button>
					{#if form?.saved}<span class="saved" role="status"><Icon name="check" size={16} />{t.profile.saved}</span>{/if}
				</div>
			</form>
		</section>
	{/if}

	{#if showNotify}
		<!-- How the member hears about dates: on their devices, by email, in their own calendar. -->
		<section class="group" id="hinweise" aria-labelledby="hinweise-title">
			<header>
				<h2 id="hinweise-title">{t.profile.sections.notify}</h2>
				<p>{t.profile.sections.notifyLead}</p>
			</header>

			{#if data.push}
				<PushSettings publicKey={data.push.publicKey} endpoints={data.push.endpoints} />
			{/if}

			<!-- Reminders by email (#123), for members without notifications; the link in every reminder leads here. -->
			{#if data.mail}
				<section class="ui-card feed" id="email">
					<h3><Icon name="mail" size={18} />{t.email.profileTitle}</h3>
					<p class="muted">{t.email.profileLead(data.email)}</p>
					<p>{data.mail.off ? t.email.profileOff : t.email.profileOn}</p>
					<form method="POST" action="?/mail" use:enhance={mails.submit()}>
						<input type="hidden" name="off" value={data.mail.off ? 'false' : 'true'} />
						<button class="btn secondary" disabled={mails.busy}>{data.mail.off ? t.email.turnOn : t.email.turnOff}</button>
					</form>
					{#if form && 'mailMessage' in form && form.mailMessage}<p class="msg error" role="alert">{form.mailMessage}</p>{/if}
				</section>
			{/if}

			<!-- The member's dates in their own calendar app (#122). -->
			{#if data.feed}
				<section class="ui-card feed" id="kalender">
					<h3><Icon name="calendar" size={18} />{t.feed.title}</h3>
					<p class="muted">{t.feed.lead}</p>
					{#if form && 'feedMessage' in form && form.feedMessage}<p class="msg error" role="alert">{form.feedMessage}</p>{/if}
					{#if data.feed.state === 'not-set-up'}
						<p class="msg info">{t.feed.notSetUp}</p>
					{:else if data.feed.state === 'none'}
						<form method="POST" action="?/feed" use:enhance={feeds.submit()}>
							<button class="btn" disabled={feeds.busy}><Icon name="link" size={16} />{t.feed.create}</button>
						</form>
					{:else}
						<div class="feed-actions">
							<a class="btn" href={data.feed.webcal}><Icon name="calendar" size={16} />{t.feed.subscribe}</a>
							<button class="btn ghost" type="button" onclick={() => copier.copy(data.feed?.state === 'active' ? data.feed.url : '')}>
								<Icon name={copier.copied ? 'check' : 'link'} size={16} />{copier.copied ? t.feed.copied : t.feed.copy}
							</button>
						</div>
						<input class="feed-url" readonly value={data.feed.url} aria-label={t.feed.title} onfocus={(event) => event.currentTarget.select()} />
						<p class="muted small">{t.feed.hint}</p>
						<div class="ui-actions">
							<form method="POST" action="?/feed" use:enhance={feeds.submit()} onsubmit={(event) => confirm(t.feed.confirmRenew) || event.preventDefault()}>
								<button disabled={feeds.busy}>{t.feed.renew}</button>
							</form>
							<form method="POST" action="?/feedRevoke" use:enhance={feeds.submit()} onsubmit={(event) => confirm(t.feed.confirmRevoke) || event.preventDefault()}>
								<button disabled={feeds.busy}>{t.feed.revoke}</button>
							</form>
						</div>
					{/if}
				</section>
			{/if}
		</section>
	{/if}

	<!-- This device: how the app looks, installing it, the tour. -->
	<section class="group" id="app" aria-labelledby="app-title">
		<header>
			<h2 id="app-title">{t.profile.sections.app}</h2>
			<p>{t.profile.sections.appLead}</p>
		</header>
		<div class="ui-list settings">
			<div class="setting" data-tour="view">
				<span>{t.theme.label}</span>
				<ThemeToggle />
			</div>
			<div class="setting" data-tour="view">
				<span>{t.textSize.label}<small class="muted">{t.textSize.hint}</small></span>
				<TextSize />
			</div>
			<!-- The app on the home screen (#279): the guide, also once it's installed. -->
			<a class="setting entry" href="/install" data-tour={install.installed ? undefined : 'install'}>
				<span class="entry-icon" aria-hidden="true"><Icon name={install.installed ? 'check' : 'download'} size={18} /></span>
				<span>{t.install.title(data.orchestraShortName)}<small class="muted">{install.installed ? t.install.entryInstalled : t.install.entryHint}</small></span>
				<Icon name="chevron" size={16} />
			</a>
			<!-- The tour for new members, once more from the start. -->
			<div class="setting" data-tour="retake">
				<span>{t.tour.label}<small class="muted">{t.tour.retakeHint}</small></span>
				<button class="btn small secondary" onclick={startTour}><Icon name="sparkle" size={14} />{t.tour.retake}</button>
			</div>
		</div>
	</section>

	<!-- Only the member's own: practice time and notes, and everything the app keeps as one file. -->
	<section class="group" id="daten" aria-labelledby="daten-title">
		<header>
			<h2 id="daten-title">{t.profile.sections.practice}</h2>
			<p>{t.profile.sections.practiceLead}</p>
		</header>

		<!-- Practice time: opt-in, only the member's own, never shown to anyone else. -->
		{#if data.member && data.practice}
			<PracticeTime
				on={data.practice.on}
				days={data.practice.days}
				today={data.practice.today}
				markedParts={data.practice.markedParts}
				message={form && 'practiceMessage' in form ? form.practiceMessage : undefined}
			/>
		{/if}

		<!-- What the app keeps about the member, as one file (#158, Art. 15 GDPR). -->
		<section class="ui-card feed">
			<h3><Icon name="download" size={18} />{t.myData.title}</h3>
			<p class="muted">{t.myData.lead}</p>
			<div class="feed-actions">
				<a class="btn secondary" href="/profil/daten.json" download data-sveltekit-reload><Icon name="download" size={16} />{t.myData.download}</a>
			</div>
			<p class="muted small">{t.myData.hint}</p>
		</section>
	</section>

	<!-- How the member signs in: a password, a personal link, and signing out. -->
	<section class="group" id="anmeldung" aria-labelledby="anmeldung-title">
		<header>
			<h2 id="anmeldung-title">{t.profile.sections.signIn}</h2>
			<p>{t.profile.sections.signInLead}</p>
		</header>

		{#if data.member && data.password}
			<!-- Email and password sign-in: set one here, or change it with the current one. -->
			<section class="ui-card feed" id="passwort">
				<h3><Icon name="shield" size={18} />{t.password.profileTitle}</h3>
				<p class="muted">{data.password.has ? t.password.profileHas(data.email) : t.password.profileNone(data.email)}</p>
				{#if form && 'passwordSaved' in form}<p class="msg ok" role="status">{t.password.saved}</p>{/if}
				<form class="password-form" method="POST" action="?/password" use:enhance={passwords.submit({ reset: true })}>
					{#if data.password.has}
						<label class="field">
							{t.password.current}
							<input name="current" type="password" autocomplete="current-password" required maxlength="200" />
						</label>
					{/if}
					<PasswordFields email={data.email} problem={form && 'passwordProblem' in form ? form.passwordProblem : null} />
					{#if form && 'passwordMessage' in form && form.passwordMessage}<p class="msg error" role="alert">{form.passwordMessage}</p>{/if}
					<div class="feed-actions">
						<button class="btn" disabled={passwords.busy}>{data.password.has ? t.password.change : t.password.set}</button>
						{#if data.password.has}<a class="muted small" href="/auth/passwort">{t.password.forgot}</a>{/if}
					</div>
				</form>
			</section>
		{/if}

		{#if data.member && data.accessLink}
			<!-- A personal link to sign in without a password or Google, e.g. on a second device. -->
			<section class="ui-card feed" id="zugangslink">
				<h3><Icon name="link" size={18} />{t.ownLink.title}</h3>
				<p class="muted">{t.ownLink.lead}</p>
				{#if form && 'linkMessage' in form && form.linkMessage}<p class="msg error" role="alert">{form.linkMessage}</p>{/if}
				{#if form && 'linkRevoked' in form}<p class="msg ok" role="status">{t.ownLink.revoked}</p>{/if}
				{#if data.accessLink.state === 'not-set-up'}
					<p class="msg info">{t.feed.notSetUp}</p>
				{:else if form && 'link' in form && form.link}
					<div class="feed-actions">
						<button class="btn" type="button" onclick={() => copier.copy(form && 'link' in form ? String(form.link) : '')}>
							<Icon name={copier.copied ? 'check' : 'link'} size={16} />{copier.copied ? t.feed.copied : t.feed.copy}
						</button>
					</div>
					<input class="feed-url" readonly value={form.link} aria-label={t.ownLink.title} onfocus={(event) => event.currentTarget.select()} />
					<p class="muted small">{t.ownLink.keep}</p>
				{:else if data.accessLink.state === 'active'}
					<div class="feed-actions">
						<form method="POST" action="?/link" use:enhance={links.submit()}>
							<input type="hidden" name="mode" value="show" />
							<button class="btn" disabled={links.busy}><Icon name="eye" size={16} />{t.ownLink.show}</button>
						</form>
					</div>
				{:else}
					<form method="POST" action="?/link" use:enhance={links.submit()}>
						<input type="hidden" name="mode" value="new" />
						<button class="btn" disabled={links.busy}><Icon name="link" size={16} />{t.ownLink.create}</button>
					</form>
				{/if}
				{#if data.accessLink.state === 'active'}
					<div class="ui-actions">
						<form method="POST" action="?/link" use:enhance={links.submit()} onsubmit={(event) => confirm(linkConfirm) || event.preventDefault()}>
							<input type="hidden" name="mode" value="new" />
							<button disabled={links.busy}>{t.feed.renew}</button>
						</form>
						<form
							method="POST"
							action="?/link"
							use:enhance={links.submit()}
							onsubmit={(event) => confirm(data.accessLink?.viaLink ? t.ownLink.confirmRevokeViaLink : t.ownLink.confirmRevoke) || event.preventDefault()}
						>
							<input type="hidden" name="mode" value="revoke" />
							<button disabled={links.busy}>{t.feed.revoke}</button>
						</form>
					</div>
				{/if}
			</section>
		{/if}

		<div class="ui-list settings" id="konten">
			<form class="setting" method="POST" action="/auth/logout">
				<span>{t.auth.signedInAs(data.email)}</span>
				<button class="logout"><Icon name="logout" size={16} />{t.auth.logout}</button>
			</form>
			<!-- Other accounts kept on this device: seldom needed, so plain rows at the very end. -->
			{#each others as account (account.email)}
				<div class="setting">
					<span>
						{account.name}
						<small>{account.email}</small>
					</span>
					<div class="ui-actions">
						<form method="POST" action="/auth/konto">
							<input type="hidden" name="email" value={account.email} />
							<button name="aktion" value="wechseln">{t.auth.accounts.switchTo}</button>
						</form>
						<form method="POST" action="/auth/konto" onsubmit={(event) => confirm(t.auth.accounts.forgetConfirm(account.name)) || event.preventDefault()}>
							<input type="hidden" name="email" value={account.email} />
							<button name="aktion" value="vergessen">{t.auth.accounts.forget}</button>
						</form>
					</div>
				</div>
			{/each}
			{#if data.accounts}
				<form class="setting" method="POST" action="/auth/konto">
					<span>{others.length ? t.auth.accounts.title : t.auth.accounts.lead}</span>
					<button class="logout" name="aktion" value="hinzufuegen"><Icon name="plus" size={16} />{t.auth.accounts.add}</button>
				</form>
			{/if}
		</div>
	</section>
</div>

<style>
	.stack {
		display: grid;
		gap: var(--space-6);
		max-width: 640px;
	}

	/* The topics, to jump to. */
	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: calc(-1 * var(--space-3));
	}

	.jump a {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		color: var(--text);
		font-size: var(--text-sm);
		text-decoration: none;
		transition: background var(--fast) var(--ease);
	}

	.jump a:hover {
		background: var(--surface-2);
	}

	/* One topic: a heading with a line on what's in it, then its cards. */
	.group {
		display: grid;
		gap: var(--space-3);
		scroll-margin-top: var(--space-6);
	}

	.group > header {
		display: grid;
		gap: 2px;
		padding: 0 var(--space-1);
	}

	.group h2 {
		margin: 0;
		font-size: var(--text-xl);
	}

	.group > header p {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	/* Cards linked to from elsewhere (/profil#kalender) land below the sticky header. */
	.group :global(section.ui-card) {
		scroll-margin-top: var(--space-6);
	}

	.feed {
		display: grid;
		gap: var(--space-3);
	}

	.feed h3 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-lg);
	}

	.feed-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.password-form {
		display: grid;
		gap: var(--space-3);
		max-width: 420px;
	}

	.feed-url {
		width: 100%;
		padding: 8px var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--bg);
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-xs);
	}

	.account {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-4);
	}

	.who {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	.who strong {
		font-size: var(--text-lg);
	}

	.who span {
		overflow: hidden;
		color: var(--text-muted);
		font-size: var(--text-sm);
		text-overflow: ellipsis;
	}

	.card {
		display: grid;
		gap: var(--space-5);
	}

	.roles {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		overflow-wrap: anywhere;
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	/* Hints, not the small buttons in the settings. */
	.muted.small {
		flex-basis: 100%;
		font-size: var(--text-xs);
	}

	.tag {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.saved {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--ok);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.setting {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
		min-height: 60px;
		padding: var(--space-3) var(--space-4);
	}

	.setting > span {
		display: grid;
		flex: 1;
		gap: 2px;
		min-width: min(100%, 220px);
	}

	.setting small {
		font-size: var(--text-xs);
	}

	.setting + .setting {
		border-top: 1px solid var(--hairline);
	}

	.setting span {
		overflow-wrap: anywhere;
	}

	form.setting span {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	/* A row that opens a page: the whole row is the link. */
	.entry {
		flex-wrap: nowrap;
		color: inherit;
		text-decoration: none;
		transition: background var(--fast) var(--ease);
	}

	.entry:hover {
		background: var(--surface-2);
	}

	.entry > :global(svg) {
		flex: none;
		color: var(--text-muted);
	}

	.setting > .entry-icon {
		display: grid;
		flex: none;
		min-width: 0;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.logout {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 36px;
		padding: 0 var(--space-3);
		border: 0;
		border-radius: var(--radius-control);
		background: color-mix(in oklab, var(--danger) 10%, transparent);
		color: var(--danger);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	@media (max-width: 480px) {
		.account .btn {
			width: 100%;
		}
	}
</style>
