<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { lacksSurname, maskEmail } from '#lib/access/access.ts';
	import { config } from '#lib/config/index.ts';
	import { formatDay } from '#lib/events/format.ts';
	import { t } from '#lib/i18n/index.ts';
	import type { InstrumentFamily } from '#lib/config/types.ts';
	import { applyFilters, type FilterGroup } from '#lib/filters.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import FilterPanel from '#lib/components/FilterPanel.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import MemberFields from '#lib/components/MemberFields.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	/** Disables the buttons while a change is saved, and keeps the scroll position. */
	const saving = new FormState();
	const submit = saving.submit({ reset: true });

	/** Emails are shortened unless asked for; the edit form always shows the full one. */
	let showEmails = $state(false);
	const mail = (email: string) => (showEmails ? email : maskEmail(email));

	/** The member whose edit form is open. */
	let editing = $state<string | null>(null);
	let query = $state('');
	let chosen = $state<string[]>([]);

	type Member = Exclude<typeof data, { state: 'off' }>['members'][number];
	const all = $derived<Member[]>(data.state === 'ready' ? data.members : []);
	const searched = $derived.by(() => {
		const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
		if (!words.length) return all;
		return all.filter((member) => {
			const text = [member.name, member.email, member.instrument ?? '', ...member.groups, ...member.orchestras].join(' ').toLowerCase();
			return words.every((word) => text.includes(word));
		});
	});

	/** Who's who in a few taps: status, role, orchestra, and what needs a look. */
	const filterGroups = $derived.by((): FilterGroup<Member>[] => {
		const statuses = [...new Set(all.map((member) => member.current))];
		const roles = [...new Set(all.flatMap((member) => member.groups))].sort((a, b) => a.localeCompare(b));
		const orchestras = [...new Set(all.flatMap((member) => member.orchestras))];
		const groups: FilterGroup<Member>[] = [];
		if (statuses.length > 1)
			groups.push({
				key: 'status',
				label: t.admin.filterStatus,
				options: statuses.map((status) => ({ value: `status:${status}`, label: t.profile.statuses[status] ?? status, test: (m) => m.current === status }))
			});
		if (roles.length)
			groups.push({
				key: 'role',
				label: t.admin.filterRole,
				options: [
					...roles.map((role) => ({ value: `rolle:${role}`, label: role, test: (m: Member) => m.groups.includes(role) })),
					{ value: 'rolle:-', label: t.admin.noRole, test: (m: Member) => !m.groups.length }
				]
			});
		if (orchestras.length > 1)
			groups.push({
				key: 'orchestra',
				label: t.admin.filterOrchestra,
				options: orchestras.map((orchestra) => ({ value: `orchester:${orchestra}`, label: orchestra, test: (m) => m.orchestras.includes(orchestra) }))
			});
		groups.push({
			key: 'notes',
			label: t.admin.filterAccess,
			options: [
				{ value: 'hinweis:link', label: t.admin.accessLinkActive, test: (m) => m.link === 'active' },
				{ value: 'hinweis:nachname', label: t.admin.noSurname, test: (m) => lacksSurname(m.name) },
				{ value: 'hinweis:instrument', label: t.admin.noInstrumentGroup, test: (m) => !m.instrument }
			]
		});
		return groups;
	});
	const members = $derived(applyFilters(searched, filterGroups, chosen));

	/** In score order, as the orchestra sits on paper: woodwinds down to strings, then the rest. */
	const ORDER: (InstrumentFamily | 'none')[] = ['holz', 'blech', 'schlagwerk', 'tasten', 'streicher', 'gesang', 'partitur', 'sonstige', 'none'];
	const families = new Map(config.instruments.map((instrument) => [instrument.name, instrument.family]));
	/** Every register a member plays in: Geige and Bratsche puts them under the strings once, Geige and Flöte under both. */
	const familiesOf = (member: Member): (InstrumentFamily | 'none')[] => {
		const found = (member.choices ?? []).map((choice) => families.get(choice.instrument) ?? ('sonstige' as const));
		return found.length ? [...new Set(found)] : ['none'];
	};
	const familyLabel = (family: InstrumentFamily | 'none') =>
		family === 'none' ? t.admin.noInstrumentGroup : family === 'partitur' ? t.piece.groups.featured : t.piece.groups[family];
	/** A few dozen members: all open. Hundreds: the registers first, open on a tap, or all at once while searching or filtering. */
	const expanded = $derived(all.length <= 40 || !!query.trim() || chosen.length > 0);
	const sections = $derived(
		ORDER.map((family) => ({
			family,
			members: members.filter((member) => familiesOf(member).includes(family)).sort((a, b) => a.name.localeCompare(b.name))
		})).filter((section) => section.members.length)
	);

	/** Asks before a button that ends a link; cancelling stops the form from being sent. */
	const confirmLink = (question: string) => (event: MouseEvent) => {
		if (!confirm(question)) event.preventDefault();
	};

	let copied = $state(false);
	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// No clipboard (e.g. plain http): the field is selected on focus for copying by hand.
		}
	}

	const confirmRemove = (name: string) => (event: SubmitEvent) => {
		if (!confirm(t.admin.confirmRemove(name))) event.preventDefault();
	};

	const confirmDeclineAll = (count: number) => (event: SubmitEvent) => {
		if (!confirm(t.admin.confirmDeclineAll(count))) event.preventDefault();
	};

	const grantable = $derived(data.state === 'ready' ? data.rights.filter((r) => r.right !== 'ansehen') : []);
	const rightLabel = (right: string) => data.rights?.find((r) => r.right === right)?.label ?? right;
</script>

<Title title={t.admin.title} />
<PageHeader title={t.admin.title} lead={t.admin.lead} />

{#if data.state === 'off'}
	<p class="msg info">{t.auth.notReady} GOOGLE_OAUTH_CLIENT_ID</p>
{:else if data.state === 'not-set-up'}
	<div class="msg info notice">
		<p>{t.admin.notSetUp}</p>
		<a class="link" href="/setup">{t.admin.runSetup}</a>
	</div>
{:else}
	{#if form?.message}
		<p class="msg error" role="alert">{form.message}</p>
	{:else if form?.erased}
		<p class="msg ok" role="status"><Icon name="check" size={16} />{t.erase.done(form.erased)}</p>
	{:else if form?.saved}
		<p class="msg ok" role="status"><Icon name="check" size={16} />{t.admin.saved}</p>
	{/if}

	<div class="top">
		<div class="ui-actions">
			{#if data.sheetUrl}
				<a href={data.sheetUrl} target="_blank" rel="noopener noreferrer"><Icon name="external" size={16} />{t.admin.openSheet}</a>
			{/if}
		</div>
		<label class="check"><input type="checkbox" bind:checked={showEmails} />{t.admin.showEmails}</label>
	</div>

	<section>
		<div class="section-head">
			<h2 class="ui-label">{t.admin.requests}{#if data.requests.length}<span class="count">{data.requests.length}</span>{/if}</h2>
			{#if data.requests.length > 1}
				<!-- Only the requests shown here; one that arrives meanwhile stays open. -->
				<div class="bulk">
					<form method="POST" action="?/approve" use:enhance={submit}>
						{#each data.requests as request (request.email)}<input type="hidden" name="email" value={request.email} />{/each}
						<button class="btn secondary small" disabled={saving.busy}>{t.admin.approveAll(data.requests.length)}</button>
					</form>
					<form method="POST" action="?/decline" use:enhance={submit} onsubmit={confirmDeclineAll(data.requests.length)}>
						{#each data.requests as request (request.email)}<input type="hidden" name="email" value={request.email} />{/each}
						<button class="btn ghost small" disabled={saving.busy}>{t.admin.declineAll}</button>
					</form>
				</div>
			{/if}
		</div>
		{#if data.requests.length}
			<ul class="ui-list">
				{#each data.requests as request (request.email)}
					<li class="person request">
						<Avatar name={request.name || request.email} />
						<span class="main">
							<strong>{request.name || mail(request.email)}</strong>
							<span class="meta">{mail(request.email)}{request.requestedAt ? ` · ${request.requestedAt}` : ''}</span>
						</span>
						<div class="actions">
							<form method="POST" action="?/approve" use:enhance={submit}>
								<input type="hidden" name="email" value={request.email} />
								<button class="btn small" disabled={saving.busy}>{t.admin.approve}</button>
							</form>
							<form method="POST" action="?/decline" use:enhance={submit}>
								<input type="hidden" name="email" value={request.email} />
								<button class="btn ghost small" disabled={saving.busy}>{t.admin.decline}</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="msg info">{t.admin.noRequests}</p>
		{/if}
	</section>

	<section>
		<h2 class="ui-label">{t.admin.members}<span class="count">{data.members.length}</span></h2>
		{#if data.members.length}
			<div class="toolbar">
				<label class="search">
					<Icon name="search" size={16} />
					<input type="search" bind:value={query} placeholder={t.admin.searchMembers} aria-label={t.admin.searchMembers} />
				</label>
				<FilterPanel bind:value={chosen} items={searched} groups={filterGroups} label={t.admin.filterMembers} size="large" />
				<span class="meta result">{t.admin.memberCount(members.length)}</span>
			</div>
		{/if}
		{#if !data.members.length}
			<p class="msg info">{t.admin.noMembers}</p>
		{:else if !members.length}
			<p class="msg info">{t.admin.noMemberMatch}</p>
		{:else}
			{#each sections as section (section.family)}
			<details class="register" open={expanded}>
			<summary class="register-head"><span>{familyLabel(section.family)}</span><span class="count">{section.members.length}</span></summary>
			<ul class="ui-list">
				{#each section.members as member (member.email)}
					<li class="person" class:open={editing === section.family + member.email}>
						{#if editing === section.family + member.email}
							<form
								class="edit"
								method="POST"
								action="?/editMember"
								use:enhance={saving.submit({
									// A link stays open, so it can be copied.
									onSuccess: (result) => {
										if (!result?.link && !result?.erase) editing = null;
									}
								})}
							>
								<input type="hidden" name="email" value={member.email} />
								<div class="edit-head">
									<Avatar name={member.name} instrument={member.instrument} size={44} />
									<span class="main">
										<strong>{member.name}</strong>
										<span class="meta">{member.email}</span>
									</span>
								</div>
								<MemberFields {member} instruments={data.playable} common={data.common} orchestras={data.orchestras} />
								<fieldset class="choices">
									<legend class="caption">{t.admin.memberRoles}</legend>
									<div class="checks">
										{#each [...new Set([...data.groups.map((g) => g.name), ...member.groups])] as group (group)}
											<label class="check"><input type="checkbox" name="group" value={group} checked={member.groups.includes(group)} />{group}</label>
										{/each}
									</div>
									{#if member.rights.length}
										<!-- What the roles add up to, as saved: it follows the roles and is not set here. -->
										<p class="meta rights">{t.admin.effectiveRights}: {member.rights.map(rightLabel).join(', ')}</p>
									{/if}
								</fieldset>
								<div class="link-box">
									<span class="caption">{t.admin.accessLink}</span>
									<p class="meta">{t.admin.linkHint}</p>
									{#if form?.link && form.link.email === member.email}
										<p>{t.admin.linkFor(member.name)}</p>
										<div class="link-row">
											<input readonly value={form.link.url} onfocus={(event) => event.currentTarget.select()} aria-label={t.admin.accessLink} />
											<button class="btn ghost" type="button" onclick={() => copy(form!.link!.url)}>{copied ? t.admin.copied : t.admin.copy}</button>
										</div>
									{/if}
									<div class="row-buttons">
										{#if member.link === 'active'}
											<button class="btn ghost small" disabled={saving.busy} formaction="?/link" name="mode" value="show" formnovalidate>{t.admin.linkShow}</button>
											<button class="btn ghost small" disabled={saving.busy} formaction="?/link" name="mode" value="new" formnovalidate onclick={confirmLink(t.admin.confirmNewLink(member.name))}>{t.admin.linkNew}</button>
											<button class="btn ghost small danger" disabled={saving.busy} formaction="?/link" name="mode" value="revoke" formnovalidate onclick={confirmLink(t.admin.confirmRevokeLink(member.name))}>{t.admin.linkRevoke}</button>
										{:else}
											<button class="btn ghost small" disabled={saving.busy} formaction="?/link" name="mode" value="new" formnovalidate>{t.admin.linkCreate}</button>
										{/if}
									</div>
								</div>
								<div class="row-buttons footer">
									<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{t.admin.save}</button>
									<button class="btn ghost" type="button" onclick={() => (editing = null)}>{t.admin.cancel}</button>
									<button class="btn ghost danger erase-open" disabled={saving.busy} formaction="?/erasePreview" formnovalidate>{t.erase.button}</button>
								</div>
							</form>
							{#if form?.erase && form.erase.email === member.email}
								<form
									class="erase"
									method="POST"
									action="?/erase"
									use:enhance={saving.submit({ onSuccess: () => (editing = null) })}
									onsubmit={(event) => {
										if (!confirm(t.erase.confirmQuestion(member.name))) event.preventDefault();
									}}
								>
									<input type="hidden" name="email" value={member.email} />
									<h3>{t.erase.title(member.name)}</h3>
									<p class="meta">{t.erase.lead}</p>
									{#if form.erase.items.length > 1}
										<ul>
											{#each form.erase.items as item (item.where)}
												<li>
													<strong>{item.where}</strong>
													<span class:gone={item.how === 'remove'}>{item.how === 'remove' ? t.erase.remove(item.count) : t.erase.anonymise(item.count)}</span>
												</li>
											{/each}
										</ul>
									{:else}
										<p>{t.erase.nothing}</p>
									{/if}
									<button class="btn destructive" disabled={saving.busy}><Icon name="trash" size={16} />{t.erase.confirm}</button>
								</form>
							{/if}
						{:else}
							<Avatar name={member.name} instrument={member.instrument} />
							<div class="main">
								<strong class="name">
									{member.name}
									{#if lacksSurname(member.name)}<span class="chip warn" title={t.admin.noSurnameHint}>{t.admin.noSurname}</span>{/if}
								</strong>
								<span class="meta">
									{[member.instrument, mail(member.email), member.orchestras.join(', ')].filter(Boolean).join(' · ')}
								</span>
							</div>
							{#if member.groups.length || member.link || member.current !== 'aktiv'}
								<span class="chips">
									{#each member.groups as group (group)}<span class="chip accent">{group}</span>{/each}
									{#if member.current !== 'aktiv'}
										<span class="chip">
											{t.profile.statuses[member.current]}{member.current === 'pausiert' && member.pausedUntil
												? ` ${t.profile.pausedUntilShort(formatDay(member.pausedUntil, config.locale))}`
												: ''}
										</span>
									{/if}
									{#if member.link}
										<span class="chip" class:accent-line={member.link === 'active'}>
											{member.link === 'active' ? t.admin.accessLinkActive : t.admin.accessLinkRevoked}
										</span>
									{/if}
								</span>
							{/if}
							<div class="actions">
								<button class="btn ghost small edit-button" disabled={saving.busy} aria-label={t.admin.edit} onclick={() => (editing = section.family + member.email)}>
									<Icon name="edit" size={14} /><span class="label">{t.admin.edit}</span>
								</button>
								<form method="POST" action="?/removeMember" use:enhance={submit} onsubmit={confirmRemove(member.name)}>
									<input type="hidden" name="email" value={member.email} />
									<button class="icon-btn" disabled={saving.busy} title={t.admin.remove} aria-label={t.admin.remove}>
										<Icon name="trash" size={16} />
									</button>
								</form>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			</details>
			{/each}
		{/if}

		<details class="ui-card add">
			<summary><Icon name="plus" size={16} />{t.admin.addMember}</summary>
			<form class="grid" method="POST" action="?/addMember" use:enhance={submit}>
				<label class="field">{t.admin.email}<input name="email" type="email" required autocomplete="off" /></label>
				<label class="field">{t.admin.name}<input name="name" autocomplete="off" /></label>
				<label class="field">{t.admin.instrument}<input name="instrument" autocomplete="off" /></label>
				<label class="field">
					{t.admin.groups}
					<input name="groups" list="group-names" autocomplete="off" placeholder={t.admin.groupsHint} />
				</label>
				<div class="wide"><button class="btn" disabled={saving.busy}><Icon name="plus" size={16} />{t.admin.add}</button></div>
			</form>
		</details>
	</section>

	<!-- Set up once, rarely changed: folded, one line each. -->
	<h2 class="ui-label setup-label">{t.admin.setupSections}</h2>
	<details class="ui-card ui-disclosure fold">
		<summary><h3>{t.admin.roles}</h3><span class="count">{data.roles.length}</span></summary>
		<p class="meta lead">{t.admin.rolesLead}</p>
		{#if data.bootstrapAdmins.length}
			<p class="meta lead">{t.admin.bootstrap(data.bootstrapAdmins.map(mail).join(', '))}</p>
		{/if}
		{#if data.roles.length}
			<ul class="inner-list">
				{#each data.roles as role (role.name)}
					<li>
						<form class="role" method="POST" action="?/setRole" use:enhance={submit}>
							<input type="hidden" name="name" value={role.name} />
							<div class="role-head">
								<strong>{role.name}</strong>
								<span class="meta">{t.admin.roleMembers(role.members)}</span>
							</div>
							<input class="role-description" name="description" value={role.description ?? ''} placeholder={t.admin.roleDescription} aria-label={t.admin.roleDescription} autocomplete="off" />
							<div class="checks">
								{#each grantable as option (option.right)}
									<label class="check"><input type="checkbox" name="right" value={option.right} checked={role.rights.includes(option.right)} />{option.label}</label>
								{/each}
							</div>
							<div class="row-buttons">
								<button class="btn small" disabled={saving.busy}><Icon name="check" size={14} />{t.admin.save}</button>
								<button class="icon-btn" disabled={saving.busy} formaction="?/removeRole" title={t.admin.remove} aria-label={t.admin.remove} onclick={confirmLink(t.admin.confirmRemoveRole(role.name))}>
									<Icon name="trash" size={16} />
								</button>
							</div>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
		{#if data.missingRoles.length}
			<form method="POST" action="?/addRoles" use:enhance={submit}>
				<button class="btn secondary small preset" disabled={saving.busy}><Icon name="plus" size={14} />{t.admin.addPresetRoles(data.missingRoles.join(', '))}</button>
			</form>
		{/if}

		<form class="grid add-form" method="POST" action="?/setRole" use:enhance={submit}>
			<h4 class="wide">{t.admin.addRole}</h4>
			<label class="field">{t.admin.roleName}<input name="name" required autocomplete="off" /></label>
			<label class="field">{t.admin.roleDescription}<input name="description" autocomplete="off" /></label>
			<div class="checks wide">
				{#each grantable as option (option.right)}
					<label class="check"><input type="checkbox" name="right" value={option.right} />{option.label}</label>
				{/each}
			</div>
			<div class="wide"><button class="btn" disabled={saving.busy}><Icon name="plus" size={16} />{t.admin.add}</button></div>
		</form>
	</details>

	<details class="ui-card ui-disclosure fold">
		<summary><h3>{t.admin.singleRights}</h3><span class="count">{data.grants.length}</span></summary>
		<p class="meta lead">{t.admin.singleRightsLead}</p>
		{#if data.grants.length}
			<ul class="inner-list">
				{#each data.grants as grant (grant.who + grant.right)}
					<li class="line">
						<span class="main">
							<strong>{grant.who.includes('@') ? mail(grant.who) : grant.who}</strong>
							<span class="meta">{rightLabel(grant.right)}</span>
						</span>
						<form method="POST" action="?/revoke" use:enhance={submit}>
							<input type="hidden" name="who" value={grant.who} />
							<input type="hidden" name="right" value={grant.right} />
							<button class="btn ghost small" disabled={saving.busy}>{t.admin.revoke}</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		<form class="grid add-form" method="POST" action="?/grant" use:enhance={submit}>
			<label class="field">
				{t.admin.who}
				<input name="who" list="who-options" required autocomplete="off" />
			</label>
			<label class="field">
				{t.admin.right}
				<select name="right" required>
					{#each grantable as option (option.right)}
						<option value={option.right}>{option.label}</option>
					{/each}
				</select>
			</label>
			<div class="wide"><button class="btn" disabled={saving.busy}><Icon name="plus" size={16} />{t.admin.grant}</button></div>
		</form>
	</details>

	<details class="ui-card ui-disclosure fold">
		<summary><h3>{t.admin.instrumentGroups}</h3><span class="count">{data.instrumentGroups.rows.length}</span></summary>
		<p class="meta lead">{t.admin.instrumentGroupsLead}</p>
		{#if !data.instrumentGroups.own}<p class="meta lead">{t.admin.instrumentGroupsDefaults}</p>{/if}
		{#if data.instrumentGroups.unknown.length}
			<p class="msg error">{t.admin.instrumentGroupsUnknown(data.instrumentGroups.unknown.join(', '))}</p>
		{/if}
		<ul class="inner-list">
			{#each data.instrumentGroups.rows as group (group.part + group.row)}
				<li class="line">
					<span class="main">
						<strong>{group.part}</strong>
						<span class="meta">
							{group.mutual ? t.admin.mutual : t.admin.alsoPlayedBy}
							{group.players.join(', ')}{group.note ? ` · ${group.note}` : ''}
						</span>
					</span>
					{#if data.instrumentGroups.own}
						<form method="POST" action="?/removeGroup" use:enhance={submit}>
							<input type="hidden" name="row" value={group.row} />
							<input type="hidden" name="part" value={group.part} />
							<button class="btn ghost small" disabled={saving.busy}>{t.admin.remove}</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>

		<form class="grid add-form" method="POST" action="?/addGroup" use:enhance={submit}>
			<label class="field">
				{t.admin.groupPart}
				<input name="part" list="instrument-names" required autocomplete="off" placeholder={t.admin.groupPartExample} />
			</label>
			<label class="field">
				{t.admin.groupPlayers}
				<input name="players" required autocomplete="off" placeholder={t.admin.groupPlayersExample} />
			</label>
			<label class="check wide"><input type="checkbox" name="mutual" />{t.admin.mutualLabel}</label>
			<div class="wide"><button class="btn" disabled={saving.busy}><Icon name="plus" size={16} />{t.admin.add}</button></div>
		</form>
	</details>

	<datalist id="instrument-names">
		{#each data.instruments as name (name)}<option value={name}></option>{/each}
	</datalist>
	<datalist id="group-names">
		{#each data.groups as group (group.name)}<option value={group.name}>{group.description}</option>{/each}
	</datalist>
	<datalist id="who-options">
		{#each data.groups as group (group.name)}<option value={group.name}>{group.description}</option>{/each}
		{#each data.members as member (member.email)}<option value={member.email}>{member.name}</option>{/each}
	</datalist>
{/if}

<style>
	section {
		margin-bottom: var(--space-6);
	}

	.msg {
		margin: 0 0 var(--space-4);
	}

	.notice {
		display: grid;
		gap: var(--space-2);
	}

	.notice p {
		margin: 0;
	}

	.link {
		color: var(--accent);
		font-weight: 600;
	}

	/* ---------- Headings and small type ---------- */

	h2.ui-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.count {
		min-width: 20px;
		padding: 0 6px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-variant-numeric: tabular-nums;
		letter-spacing: 0;
		text-align: center;
	}

	.meta {
		color: var(--text-muted);
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}

	.caption {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	/* ---------- The row above everything ---------- */

	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		margin-bottom: var(--space-5);
	}

	.section-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	.section-head .ui-label {
		margin-bottom: 0;
	}

	.bulk {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	/* ---------- Search and filter, as on the other lists ---------- */

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-4);
		margin-bottom: var(--space-3);
	}

	.search {
		display: flex;
		flex: 1 1 240px;
		align-items: center;
		gap: var(--space-2);
		max-width: 420px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text-muted);
		transition: border-color var(--fast) var(--ease);
	}

	.search:focus-within {
		border-color: var(--accent);
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.search input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		border: 0;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: max(var(--control-min), var(--text-md));
		outline: none;
	}


	/* ---------- People: requests and members ---------- */

	/* One line per person on wide screens: avatar, who, roles, actions, so hundreds stay scannable. */
	.person {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) minmax(0, auto) auto;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		padding: 10px var(--space-4);
		scroll-margin-top: 140px;
	}

	.person > .chips {
		justify-content: flex-end;
		max-width: 340px;
		margin: 0;
	}

	.person .meta {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Narrower: the roles go under the name. */
	@media (max-width: 760px) {
		.person:not(.request) {
			grid-template-columns: auto minmax(0, 1fr) auto;
			align-items: start;
		}

		.person:not(.request) > .chips {
			grid-column: 2;
			grid-row: 2;
			justify-content: flex-start;
			max-width: none;
		}

		.person:not(.request) > .actions {
			grid-column: 3;
			grid-row: 1 / span 2;
		}

		.person .meta {
			white-space: normal;
		}
	}

	/* ---------- Registers ---------- */

	.result {
		margin-left: auto;
		font-variant-numeric: tabular-nums;
	}


	.register + .register {
		margin-top: var(--space-2);
	}

	.register[open] + .register {
		margin-top: var(--space-4);
	}

	.register {
		scroll-margin-top: 72px;
	}

	/* Stays at the top while its register scrolls by, under the frosted top bar. */
	.register-head {
		position: sticky;
		top: var(--header-height, 60px);
		z-index: 2;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-2) var(--space-1);
		background: color-mix(in oklab, var(--bg) 92%, transparent);
		backdrop-filter: saturate(1.6) blur(20px);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		list-style: none;
		cursor: pointer;
	}

	.register-head::-webkit-details-marker {
		display: none;
	}

	.register-head::after {
		content: '';
		width: 7px;
		height: 7px;
		margin-left: auto;
		margin-right: var(--space-3);
		border-right: 2px solid var(--text-muted);
		border-bottom: 2px solid var(--text-muted);
		transform: rotate(-45deg);
		transition: transform var(--fast) var(--ease);
	}

	.register[open] > .register-head::after {
		transform: rotate(45deg);
	}

	/* Folded: a quiet row per register, so hundreds of members read as a handful of lines first. */
	.register:not([open]) > .register-head {
		position: static;
		min-height: var(--tap);
		padding: 0 var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		backdrop-filter: none;
		box-shadow: var(--shadow);
		color: var(--text);
		font-size: var(--text-md);
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
		transition: background var(--fast) var(--ease);
	}

	.register:not([open]) > .register-head:hover {
		background: var(--surface-2);
	}

	.person.request {
		align-items: center;
	}

	.person.open {
		display: block;
		padding: var(--space-5);
		background: color-mix(in oklab, var(--surface-2) 45%, var(--surface));
	}

	.main {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.name {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-top: var(--space-1);
	}

	.chip {
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.chip.accent {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.chip.accent-line {
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 45%, transparent);
		background: none;
		color: var(--accent);
	}

	.chip.warn {
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
		font-weight: 650;
	}


	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.icon-btn {
		display: grid;
		flex: none;
		place-items: center;
		width: 36px;
		height: 36px;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	.icon-btn:hover {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.icon-btn:disabled {
		opacity: 0.6;
		cursor: progress;
	}

	@media (pointer: coarse) {
		.icon-btn {
			width: var(--tap);
			height: var(--tap);
		}
	}

	@media (pointer: coarse) and (max-width: 560px) {
		.btn.edit-button {
			width: var(--tap);
			height: var(--tap);
		}
	}

	/* Phones: the two row actions shrink to their icons, so names and chips keep the width. */
	@media (max-width: 560px) {
		.person {
			padding-right: var(--space-2);
		}

		.person .actions {
			gap: 0;
			margin-top: -4px;
		}

		.btn.edit-button {
			width: 36px;
			padding: 0;
			border-color: transparent;
			color: var(--text-muted);
		}

		.btn.edit-button:hover {
			background: var(--surface-2);
			color: var(--text);
		}

		.edit-button .label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}

		.person.request {
			grid-template-columns: auto minmax(0, 1fr);
		}

		.person.request .actions {
			grid-column: 1 / -1;
			margin-top: var(--space-2);
		}

		.person.request .actions form,
		.person.request .actions .btn {
			flex: 1;
			width: 100%;
		}
	}

	/* ---------- Editing a member ---------- */

	.edit {
		display: grid;
		gap: var(--space-4);
	}

	.edit-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.choices {
		margin: 0;
		padding: 0;
		border: 0;
	}

	.choices legend {
		margin-bottom: var(--space-2);
		padding: 0;
	}

	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
	}

	/* A role's rights in aligned columns, so two roles compare at a glance. */
	.role .checks,
	.add-form .checks {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: 0 var(--space-4);
	}

	label.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
		color: var(--text);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	label.check input {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--accent);
	}

	@media (pointer: coarse) {
		label.check {
			min-height: var(--tap);
		}
	}

	.link-box {
		display: grid;
		gap: var(--space-2);
		padding-top: var(--space-4);
		border-top: 1px solid var(--hairline);
	}

	.link-box p {
		margin: 0;
	}

	.link-row {
		display: flex;
		gap: var(--space-2);
	}

	.link-row input {
		flex: 1;
		min-width: 0;
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--bg);
		color: var(--text);
		font-family: ui-monospace, monospace;
		font-size: max(var(--control-min), var(--text-xs));
	}

	.row-buttons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.row-buttons.footer {
		padding-top: var(--space-4);
		border-top: 1px solid var(--hairline);
	}

	.btn.danger {
		color: var(--danger);
	}

	.erase-open {
		margin-left: auto;
	}

	.erase {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-4);
		padding: var(--space-4);
		border: 1px solid color-mix(in oklab, var(--danger) 55%, transparent);
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--danger) 6%, var(--surface));
	}

	.erase h3 {
		margin: 0;
		font-size: var(--text-base);
	}

	.erase p {
		margin: 0;
	}

	.erase ul {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-md);
	}

	.erase li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.erase .gone {
		color: var(--danger);
	}

	.btn.destructive {
		justify-self: start;
		background: var(--danger);
		color: var(--accent-contrast);
	}

	/* ---------- Adding ---------- */

	.add {
		margin-top: var(--space-4);
		padding: var(--space-3) var(--space-5);
	}

	.add summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 40px;
		color: var(--accent);
		font-weight: 600;
		list-style: none;
		cursor: pointer;
	}

	.add summary::-webkit-details-marker {
		display: none;
	}

	.add[open] {
		padding-bottom: var(--space-5);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-3);
		margin-top: var(--space-3);
	}

	.wide {
		grid-column: 1 / -1;
	}

	/* ---------- The folded set-up sections ---------- */

	.setup-label {
		margin-top: var(--space-7);
	}

	.fold {
		padding: var(--space-1) var(--space-5);
	}

	.fold + .fold {
		margin-top: var(--space-3);
	}

	.fold[open] {
		padding-bottom: var(--space-5);
	}

	.fold > summary h3 {
		margin: 0;
		font-size: var(--text-base);
	}

	.lead {
		max-width: 68ch;
		margin: 0 0 var(--space-3);
	}

	/* Inside a card: hairlines, not a second shadowed card. */
	.inner-list {
		margin: 0 0 var(--space-3);
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--hairline);
	}

	.inner-list > li {
		padding: var(--space-4) 0;
		border-bottom: 1px solid var(--hairline);
	}

	.inner-list > li.line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-3) 0;
	}

	.role {
		display: grid;
		gap: var(--space-3);
	}

	.role-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
	}

	.role-description {
		min-width: 0;
		padding: 9px var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: max(var(--control-min), var(--text-md));
	}

	.role-description:focus,
	.link-row input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.preset {
		margin-bottom: var(--space-3);
	}

	.add-form {
		margin-top: var(--space-4);
	}

	.add-form h4 {
		margin: 0;
		font-size: var(--text-md);
	}
</style>
