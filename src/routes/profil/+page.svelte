<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import MemberFields from '#lib/components/MemberFields.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
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

	let copied = $state(false);
	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2500);
		} catch {
			// The field below is selectable as a fallback.
		}
	}
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

	{#if !data.member}
		<p class="msg info">{t.profile.notMember}</p>
	{:else}
		<form class="ui-card card" method="POST" action="?/save" use:enhance={saving.submit()} data-tour="profile">
			<!-- Rebuilt after saving, so the form shows what's in the sheet now. -->
			{#key JSON.stringify(data.member)}
				<MemberFields member={data.member} instruments={data.instruments} common={data.common} orchestras={data.orchestras} />
			{/key}

			{#if data.member.groups.length}
				<p class="groups">
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
	{/if}

	{#if data.member && data.feed}
		<!-- The member's dates in their own calendar app (#122). -->
		<section class="ui-card feed" id="kalender">
			<h2><Icon name="calendar" size={18} />{t.feed.title}</h2>
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
					<button class="btn ghost" type="button" onclick={() => copy(data.feed?.state === 'active' ? data.feed.url : '')}>
						<Icon name={copied ? 'check' : 'link'} size={16} />{copied ? t.feed.copied : t.feed.copy}
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

	{#if data.member && data.push}
		<PushSettings publicKey={data.push.publicKey} endpoints={data.push.endpoints} />
	{/if}

	<!-- Reminders by email (#123), for members without notifications; the link in every reminder leads here. -->
	{#if data.member && data.mail}
		<section class="ui-card feed" id="email">
			<h2><Icon name="mail" size={18} />{t.email.profileTitle}</h2>
			<p class="muted">{t.email.profileLead(data.email)}</p>
			<p>{data.mail.off ? t.email.profileOff : t.email.profileOn}</p>
			<form method="POST" action="?/mail" use:enhance={mails.submit()}>
				<input type="hidden" name="off" value={data.mail.off ? 'false' : 'true'} />
				<button class="btn secondary" disabled={mails.busy}>{data.mail.off ? t.email.turnOn : t.email.turnOff}</button>
			</form>
			{#if form && 'mailMessage' in form && form.mailMessage}<p class="msg error" role="alert">{form.mailMessage}</p>{/if}
		</section>
	{/if}

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
	<section class="ui-card feed" id="daten">
		<h2><Icon name="download" size={18} />{t.myData.title}</h2>
		<p class="muted">{t.myData.lead}</p>
		<div class="feed-actions">
			<a class="btn secondary" href="/profil/daten.json" download data-sveltekit-reload><Icon name="download" size={16} />{t.myData.download}</a>
		</div>
		<p class="muted small">{t.myData.hint}</p>
	</section>

	<section>
		<h2 class="ui-label">{t.profile.settings}</h2>
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
			<form class="setting" method="POST" action="/auth/logout">
				<span>{t.auth.signedInAs(data.email)}</span>
				<button class="logout"><Icon name="logout" size={16} />{t.auth.logout}</button>
			</form>
		</div>
	</section>
</div>

<style>
	.feed {
		display: grid;
		gap: var(--space-3);
	}

	.feed h2 {
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

	.stack {
		display: grid;
		gap: var(--space-5);
		max-width: 640px;
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

	.groups {
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
