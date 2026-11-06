<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import LegalPage from '#lib/components/LegalPage.svelte';

	let { data } = $props();
	const context = $derived({ name: data.contact.name });
</script>

<LegalPage
	title={t.legal.terms.title}
	lead={t.legal.terms.lead(context)}
	sections={t.legal.terms.sections(context)}
	contact={data.contact}
	showContact={false}
	credits
	other={{ href: '/datenschutz', label: t.legal.links.privacy }}
/>
