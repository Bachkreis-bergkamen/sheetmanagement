<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import LegalPage from '#lib/components/LegalPage.svelte';

	let { data } = $props();
	const context = $derived({ name: data.contact.name });
</script>

<LegalPage
	title={t.legal.privacy.title}
	lead={t.legal.privacy.lead(context)}
	sections={t.legal.privacy.sections(context)}
	contact={data.contact}
	showContact
	other={{ href: '/nutzungsbedingungen', label: t.legal.links.terms }}
/>
