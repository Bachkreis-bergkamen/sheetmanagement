import { t } from '#lib/i18n/index.ts';
import type { Stroke } from './marks.ts';
import type { PageMarks } from './page-marks.svelte.ts';

/** Another member's marks in the part, offered to their section. */
export type Offer = { id: string; from: string; pages: Record<number, Stroke[]> };

const json = { 'content-type': 'application/json' };

/**
 * Sharing marks with the section, in the practice viewer (PracticeScore): the member's own offer,
 * and the offers of others, shown one at a time, newest first, to be taken over all at once, one
 * mark at a time, or declined. Asking "are you sure?" is up to the viewer.
 */
export class SectionOffers {
	/** When the member last offered their own marks here; null when they don't. */
	shared = $state<string | null>(null);
	pending = $state<Offer[]>([]);
	/** The offer's marks shown on the page, dashed, to be taken over with a tap. */
	reviewing = $state(false);
	/** Marks taken over one by one from the offer shown. */
	picked = $state(0);
	/** What went wrong, or what was left out; empty when all is well. */
	note = $state('');
	/** The offer shown. */
	offer = $derived(this.pending[0] as Offer | undefined);
	/** How many marks the offer shown still has, on all pages. */
	count = $derived(this.offer ? Object.values(this.offer.pages).reduce((sum, strokes) => sum + strokes.length, 0) : 0);
	#marks: PageMarks;
	#file: () => string;

	constructor(marks: PageMarks, file: () => string) {
		this.#marks = marks;
		this.#file = file;
	}

	/** What the server says, e.g. on opening another part. */
	reset(sharedAt: string | null, offers: Offer[]) {
		this.shared = sharedAt;
		this.pending = offers.map((offer) => ({ ...offer, pages: { ...offer.pages } }));
	}

	/** The offered marks shown on a page. */
	offered(page: number): Stroke[] {
		return this.reviewing && this.offer ? (this.offer.pages[page] ?? []) : [];
	}

	async share() {
		await this.#marks.flush();
		const response = await this.#send('/api/ueben/notizen/teilen', 'POST', { file: this.#file() });
		if (response?.ok) {
			this.shared = ((await response.json()) as { at: string }).at;
			this.note = '';
		} else this.note = response?.status === 400 ? t.practice.share.nothing : t.practice.share.failed;
	}

	async unshare() {
		const response = await this.#send('/api/ueben/notizen/teilen', 'DELETE', { file: this.#file() });
		if (response?.ok) this.shared = null;
		else this.note = t.practice.share.failed;
	}

	/** One offered mark on the page into the member's own, if it fits. */
	take(page: number, index: number) {
		const offer = this.offer;
		const offered = this.offered(page);
		const stroke = offered[index];
		if (!offer || !stroke || !this.#marks.add(page, stroke)) return;
		this.pending[0] = { ...offer, pages: { ...offer.pages, [page]: offered.filter((_, i) => i !== index) } };
		this.picked++;
	}

	/** Ends the offer shown: everything taken over, some by hand, or none. */
	async answer(kind: 'all' | 'some' | 'declined') {
		const offer = this.offer;
		if (!offer) return;
		await this.#marks.flush();
		const response = await this.#send('/api/ueben/notizen/angebot', 'POST', { id: offer.id, answer: kind });
		if (!response?.ok) return void (this.note = t.practice.share.failed);
		const { pages, skipped } = (await response.json()) as { pages: Record<number, Stroke[]>; skipped: number };
		if (Object.keys(pages).length) this.#marks.assign(pages);
		this.note = skipped ? t.practice.share.skipped(skipped) : '';
		this.pending = this.pending.slice(1);
		this.reviewing = false;
		this.picked = 0;
	}

	#send(url: string, method: string, body: unknown) {
		return fetch(url, { method, headers: json, body: JSON.stringify(body) }).catch(() => null);
	}
}
