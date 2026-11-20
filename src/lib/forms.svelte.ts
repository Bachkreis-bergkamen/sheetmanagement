import type { SubmitFunction } from '$app/forms';
import { t } from '#lib/i18n/index.ts';
import { RequestIds, stampForm } from '#lib/request-id.ts';

/** One short message at the bottom of the screen, e.g. when saving failed. Shown by Toast.svelte. */
export const toast = $state<{ message: string | null }>({ message: null });

let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, ms = 6000) {
	toast.message = message;
	clearTimeout(hideTimer);
	hideTimer = setTimeout(() => (toast.message = null), ms);
}

export interface SubmitOptions {
	/** Clear the form after a successful save, e.g. an "add" form. */
	reset?: boolean;
	/** For an action of another page: stay on this one instead of following it there. */
	stay?: boolean;
	/** Called as the form is sent, e.g. to show the choice at once while the sheet catches up. */
	onStart?: (input: Parameters<SubmitFunction>[0]) => void;
	/** Called after a successful save, with what the action returned. */
	onSuccess?: (data: Record<string, unknown> | undefined) => void;
	/** Called when the action refused, with what it returned, e.g. to say so on another page. */
	onFailure?: (data: Record<string, unknown> | undefined) => void;
	/**
	 * Called instead of the "try again" message when the form can't reach the server (offline, a
	 * dead spot in the hall), for a form that keeps what was entered and sends it later (#191).
	 */
	offline?: (input: Parameters<SubmitFunction>[0]) => void;
}

/**
 * The saving state of a page's forms, for `use:enhance={form.submit()}` and
 * `disabled={form.busy}`. Buttons are enabled again whatever happens, and when the
 * server fails (Google slow or down) the page stays as it is, with what was typed,
 * and a message says to try again instead of the error page replacing everything.
 */
export class FormState {
	/** While a form is saving; pages disable their buttons meanwhile. */
	busy = $state(false);
	#ids = new RequestIds();

	submit(options: SubmitOptions = {}): SubmitFunction {
		return (input) => {
			// Known to be offline: nothing is sent, the form keeps it for later.
			if (options.offline && typeof navigator !== 'undefined' && !navigator.onLine) {
				input.cancel();
				options.offline(input);
				return;
			}
			// The same content sent again without an answer keeps its id, so it isn't saved twice (#191).
			const id = this.#ids.for(input.formElement, input.formData);
			if (id) stampForm(input.formData, id);
			this.busy = true;
			options.onStart?.(input);
			return async ({ result, update }) => {
				// The server answered for this content; an error (or none at all) keeps the id for the retry.
				if (result.type !== 'error') this.#ids.answered(input.formElement);
				try {
					// Without a status the request never got an answer: the network, not the server.
					if (result.type === 'error' && result.status === undefined && options.offline) {
						options.offline(input);
						return;
					}
					if (result.type === 'error') {
						showToast(result.status === 503 ? t.common.saveUnavailable : result.status === 409 ? t.common.stillSaving : t.common.saveFailed);
						return;
					}
					await update({ reset: !!options.reset && result.type === 'success', ...(options.stay ? { navigate: false } : {}) });
					if (result.type === 'success') options.onSuccess?.(result.data);
					if (result.type === 'failure') options.onFailure?.(result.data);
				} catch (error) {
					console.error(error);
					showToast(t.common.saveFailed);
				} finally {
					this.busy = false;
				}
			};
		};
	}
}
