import { t } from '#lib/i18n/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stroke } from './marks.ts';
import { PageMarks } from './page-marks.svelte.ts';
import { SectionOffers, type Offer } from './section-offers.svelte.ts';

vi.mock('../offline/marks.ts', async (original) => ({ ...(await original<typeof import('../offline/marks.ts')>()), keepPage: async () => {} }));

const line = (x: number): Stroke => ({ color: 'red', points: [x, 0.5, x + 0.01, 0.5] });
const fetchMock = vi.fn<typeof fetch>();
const offer = (): Offer => ({ id: 'o1', from: 'Anna', pages: { 1: [line(0.1), line(0.2)], 2: [line(0.3)] } });

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
	fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
});
afterEach(() => {
	vi.unstubAllGlobals();
	fetchMock.mockReset();
});

function setup(offers: Offer[] = [offer()]) {
	const marks = new PageMarks(() => 'part');
	const section = new SectionOffers(marks, () => 'part');
	section.reset(null, offers);
	return { marks, section };
}

describe('SectionOffers', () => {
	it('shows the newest offer, with how many marks it has', () => {
		const { section } = setup([offer(), { id: 'o2', from: 'Ben', pages: {} }]);
		expect(section.offer?.from).toBe('Anna');
		expect(section.count).toBe(3);
	});

	it("shows an offer's marks on the page only while reviewing", () => {
		const { section } = setup();
		expect(section.offered(1)).toEqual([]);
		section.reviewing = true;
		expect(section.offered(1)).toEqual([line(0.1), line(0.2)]);
		expect(section.offered(5)).toEqual([]);
	});

	it('takes one offered mark over into the member’s own, and out of the offer', () => {
		const { marks, section } = setup();
		section.reviewing = true;
		section.take(1, 1);
		expect(marks.on(1)).toEqual([line(0.2)]);
		expect(section.offered(1)).toEqual([line(0.1)]);
		expect(section.picked).toBe(1);
		expect(section.count + section.picked).toBe(3);
	});

	it('does not change the offers it was given', () => {
		const given = [offer()];
		const { section } = setup(given);
		section.reviewing = true;
		section.take(1, 0);
		expect(given[0].pages[1]).toHaveLength(2);
	});

	it('answers an offer, takes the merged pages, and moves on to the next', async () => {
		fetchMock.mockResolvedValue(Response.json({ pages: { 2: [line(0.3)] }, skipped: 1 }));
		const { marks, section } = setup([offer(), { id: 'o2', from: 'Ben', pages: {} }]);
		section.reviewing = true;
		section.take(1, 0);
		await section.answer('some');
		expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ id: 'o1', answer: 'some' });
		expect(marks.on(2)).toEqual([line(0.3)]);
		expect(section.note).toBe(t.practice.share.skipped(1));
		expect(section.offer?.from).toBe('Ben');
		expect(section.reviewing).toBe(false);
		expect(section.picked).toBe(0);
	});

	it('keeps the offer when the answer could not be sent', async () => {
		fetchMock.mockRejectedValue(new TypeError('offline'));
		const { section } = setup();
		await section.answer('declined');
		expect(section.note).toBe(t.practice.share.failed);
		expect(section.offer?.id).toBe('o1');
	});

	it('shares the member’s marks and takes them back', async () => {
		const { section } = setup([]);
		fetchMock.mockResolvedValue(Response.json({ at: '2026-11-16T10:00:00Z' }));
		await section.share();
		expect(section.shared).toBe('2026-11-16T10:00:00Z');
		fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
		await section.unshare();
		expect(section.shared).toBeNull();
		expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
			['/api/ueben/notizen/teilen', 'POST'],
			['/api/ueben/notizen/teilen', 'DELETE']
		]);
	});

	it('says when there is nothing to share', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
		const { section } = setup([]);
		await section.share();
		expect(section.note).toBe(t.practice.share.nothing);
		expect(section.shared).toBeNull();
	});
});
