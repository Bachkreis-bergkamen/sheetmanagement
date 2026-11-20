<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import Icon, { type IconName } from './Icon.svelte';

	let { icon, text }: { icon: IconName; text: string } = $props();
</script>

<div class="empty">
	<div class="badge"><Icon name={icon} size={26} /></div>
	<span class="soon">{t.common.comingSoon}</span>
	<p>{text}</p>
</div>

<style>
	.empty {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		padding: var(--space-7) var(--space-5);
		border: 1px dashed var(--border);
		border-radius: var(--radius-l);
		text-align: center;
		color: var(--text-muted);
	}

	.badge {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.soon {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--accent);
	}

	p {
		max-width: 42ch;
	}
</style>
