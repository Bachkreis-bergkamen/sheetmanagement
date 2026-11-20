<script lang="ts">
	import { toast } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Icon from './Icon.svelte';
</script>

<div class="region" role="status" aria-live="polite">
	{#if toast.message}
		<div class="toast">
			<span>{toast.message}</span>
			<button type="button" onclick={() => (toast.message = null)} aria-label={t.nav.close} title={t.nav.close}>
				<Icon name="x" size={16} />
			</button>
		</div>
	{/if}
</div>

<style>
	.region {
		position: fixed;
		left: 0;
		right: 0;
		bottom: var(--space-5);
		z-index: 60;
		display: flex;
		justify-content: center;
		padding: 0 var(--space-4);
		pointer-events: none;
	}
	.toast {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		max-width: 32rem;
		padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
		border-radius: var(--radius-control);
		background: var(--text);
		color: var(--bg);
		box-shadow: var(--shadow-raised);
		pointer-events: auto;
		animation: rise 0.2s ease-out;
	}
	button {
		display: grid;
		place-items: center;
		flex: none;
		padding: var(--space-1);
		border: none;
		border-radius: var(--radius-pill);
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	/* Above the bottom navigation on phones. */
	@media (max-width: 720px) {
		.region {
			bottom: calc(var(--tabbar-height) + var(--dock-height, 0px) + env(safe-area-inset-bottom) + var(--space-3));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.toast {
			animation: none;
		}
	}
</style>
