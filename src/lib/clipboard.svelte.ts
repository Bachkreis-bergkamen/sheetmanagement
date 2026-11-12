/**
 * A "Copy" button's state: copies a text and says "Copied" for a moment. Without a clipboard
 * (plain http, an older browser) nothing happens; each place also shows the text to copy by hand.
 */
export class Copier {
	copied = $state(false);
	#timer: ReturnType<typeof setTimeout> | undefined;

	copy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			return;
		}
		this.copied = true;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.copied = false), 2500);
	};
}
