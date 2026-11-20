<script lang="ts">
	import { showToast } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Icon from './Icon.svelte';

	/**
	 * Shares a ready-made text, e.g. a concert's date, place and programme for the group
	 * chat: the phone's share sheet where there is one, else the clipboard.
	 */
	let { title, text, url }: { title: string; text: string; url: string } = $props();

	async function share() {
		const full = new URL(url, location.href).toString();
		if (navigator.share) {
			try {
				await navigator.share({ title, text, url: full });
				return;
			} catch (error) {
				// Closing the share sheet isn't an error.
				if ((error as DOMException).name === 'AbortError') return;
			}
		}
		try {
			await navigator.clipboard.writeText(`${text}\n${full}`);
			showToast(t.common.copied, 4000);
		} catch {
			showToast(t.common.copyFailed);
		}
	}
</script>

<button type="button" onclick={share}><Icon name="share" size={16} />{t.common.share}</button>
