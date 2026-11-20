/**
 * Saves that happen once (#191): every form the app sends carries a request id as its first
 * field. The server remembers what that save answered, so a double tap, or tapping again after
 * the answer got lost in a dead spot, gives the same answer instead of a second row.
 */

/** The field's name. First in the body, so the server reads it without reading the whole upload. */
export const REQUEST_FIELD = '_request';

const ID = /^[\w-]{8,64}$/;

export const isRequestId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

/** What the form sends, as text, so a retry of the same content is recognised; files by name, size and date. */
export function fingerprintForm(data: FormData): string {
	const parts: string[] = [];
	for (const [key, value] of data.entries()) {
		if (key === REQUEST_FIELD) continue;
		parts.push(`${key}=${typeof value === 'string' ? value : `file:${value.name}:${value.size}:${value.lastModified}`}`);
	}
	return JSON.stringify(parts);
}

/** Puts the id first, keeping every other field (and its files) in order. */
export function stampForm(data: FormData, id: string) {
	const entries = [...data.entries()].filter(([key]) => key !== REQUEST_FIELD);
	for (const key of new Set(entries.map(([key]) => key))) data.delete(key);
	data.delete(REQUEST_FIELD);
	data.append(REQUEST_FIELD, id);
	for (const [key, value] of entries) data.append(key, value);
}

/** A new id; null where the browser has none to give (an old one, or not over https). */
export function newRequestId(): string | null {
	return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : null;
}

/**
 * The id per form: kept while the same content is sent again without an answer (the retry after
 * a lost answer), new once the server answered or the content changed.
 */
export class RequestIds {
	#open = new WeakMap<object, { id: string; print: string }>();

	/** The id to send this form's content with. */
	for(form: object, data: FormData): string | null {
		const print = fingerprintForm(data);
		const open = this.#open.get(form);
		if (open && open.print === print) return open.id;
		const id = newRequestId();
		if (id) this.#open.set(form, { id, print });
		else this.#open.delete(form);
		return id;
	}

	/** The server answered: the next send is a new save, even with the same content. */
	answered(form: object) {
		this.#open.delete(form);
	}
}
