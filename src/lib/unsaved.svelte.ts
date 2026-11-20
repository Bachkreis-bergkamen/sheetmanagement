import { beforeNavigate } from '$app/navigation';
import * as t from '#lib/i18n/texts.ts';

/**
 * Asks before leaving an editor with changes that aren't saved yet: on links inside the app
 * and on closing or reloading the tab. Call once from a page's script; `dirty` is read at
 * the moment someone leaves.
 */
export function guardUnsaved(dirty: () => boolean) {
	beforeNavigate((navigation) => {
		if (!dirty()) return;
		// Leaving the site or closing the tab: the browser shows its own question.
		if (navigation.willUnload) {
			navigation.cancel();
			return;
		}
		// Saving redirects; that's leaving on purpose.
		if (navigation.type === 'form') return;
		if (!confirm(t.common.unsaved)) navigation.cancel();
	});
}
