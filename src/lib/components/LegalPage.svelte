<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { LegalSection } from '#lib/i18n/legal.de.ts';
	import type { LegalContact } from '#lib/server/legal.ts';
	import Title from './Title.svelte';

	let {
		title,
		lead,
		sections,
		contact,
		showContact,
		other,
		credits = false
	}: {
		title: string;
		lead: string;
		sections: LegalSection[];
		contact: LegalContact;
		/** The privacy notice must name who is responsible. */
		showContact: boolean;
		other: { href: string; label: string };
		/** The instrument drawings' CC BY credit (on the terms page). */
		credits?: boolean;
	} = $props();

	// Name and email are enough contact details; the postal address is optional.
	const missing = $derived(contact.email ? [] : ['LEGAL_EMAIL']);
</script>

<Title {title} />

<article>
	<h1>{title}</h1>
	<p class="lead">{lead}</p>

	{#if showContact}
		<section>
			<h2>{t.legal.contactHeading}</h2>
			<p class="contact">
				{contact.name}
				{#if contact.address}<br />{contact.address}{/if}
				{#if contact.email}<br />{t.legal.email}: <a href="mailto:{contact.email}">{contact.email}</a>{/if}
			</p>
			{#if missing.length}<p class="missing">{t.legal.contactMissing(missing.join(', '))}</p>{/if}
		</section>
	{/if}

	{#each sections as section (section.heading)}
		<section>
			<h2>{section.heading}</h2>
			{#each section.paragraphs as paragraph (paragraph)}<p>{paragraph}</p>{/each}
			{#if section.list}
				<ul>
					{#each section.list as item (item)}<li>{item}</li>{/each}
				</ul>
			{/if}
		</section>
	{/each}

	{#if credits}
		<section>
			<h2>{t.footer.credits.heading}</h2>
			<p>{t.footer.credits.text} <a href="/licenses/game-icons-CC-BY-3.0.txt">{t.footer.credits.license}</a></p>
		</section>
	{/if}

	<p class="footer">{t.legal.updated} · <a href={other.href}>{other.label}</a></p>
</article>

<style>
	article {
		max-width: 680px;
	}

	h1 {
		margin-bottom: var(--space-3);
	}

	.lead {
		margin-bottom: var(--space-5);
		color: var(--text-muted);
		font-size: var(--text-lg);
	}

	section {
		margin-bottom: var(--space-5);
	}

	h2 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-lg);
	}

	p,
	li {
		line-height: 1.6;
		overflow-wrap: anywhere;
	}

	p + p {
		margin-top: var(--space-2);
	}

	ul {
		margin: var(--space-2) 0 0;
		padding-left: var(--space-5);
	}

	li + li {
		margin-top: var(--space-1);
	}

	a {
		color: var(--accent);
	}

	.missing {
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		font-size: var(--text-sm);
	}

	.footer {
		margin-top: var(--space-6);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>
