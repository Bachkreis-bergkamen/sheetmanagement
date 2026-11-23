import { describe, expect, it } from 'vitest';
import { bucketOf, inpOf, p75, parseReport, vitalRows } from './vitals.ts';

describe('field speed (#187)', () => {
	it('puts a value into the first bucket it does not exceed', () => {
		expect(bucketOf(0)).toBe(50);
		expect(bucketOf(200)).toBe(200);
		expect(bucketOf(201)).toBe(300);
		expect(bucketOf(1499)).toBe(1500);
		expect(bucketOf(90_000)).toBe(60_000);
	});

	it('keeps what a browser may send and drops the rest', () => {
		expect(parseReport({ device: 'phone', items: [{ route: '/stuecke/[id]', lcp: 1234, inp: 80, ttfb: 'x' }] })).toEqual([
			{ route: '/stuecke/[id]', device: 'phone', metric: 'lcp', bucket: 1250 },
			{ route: '/stuecke/[id]', device: 'phone', metric: 'inp', bucket: 100 }
		]);
		expect(parseReport({ device: 'tv', items: [{ route: '/', lcp: 1 }] })).toEqual([]);
		expect(parseReport({ device: 'phone', items: [{ route: '/stuecke/abc?x=1', lcp: 1 }, { route: '/api/x', lcp: 1 }, { route: '/', lcp: -1 }, { route: '/', inp: 1e9 }] })).toEqual([]);
		expect(parseReport(null)).toEqual([]);
	});

	it('reads the p75 as the upper edge of its bucket', () => {
		expect(p75([])).toBeNull();
		expect(p75([{ bucket: 1000, count: 3 }, { bucket: 4000, count: 1 }])).toBe(1000);
		expect(p75([{ bucket: 4000, count: 2 }, { bucket: 1000, count: 2 }])).toBe(4000);
	});

	it('makes one row per route and device, the most measured first', () => {
		const rows = vitalRows([
			{ route: '/', device: 'phone', metric: 'lcp', bucket: 1000, count: 5 },
			{ route: '/', device: 'phone', metric: 'inp', bucket: 100, count: 9 },
			{ route: '/kalender', device: 'phone', metric: 'lcp', bucket: 2500, count: 8 },
			{ route: '/', device: 'desktop', metric: 'ttfb', bucket: 300, count: 1 },
			{ route: '/', device: 'desktop', metric: 'server', bucket: 50, count: 1 }
		]);
		expect(rows.map((row) => [row.route, row.device, row.loads, row.lcp, row.inp, row.ttfb, row.server])).toEqual([
			['/kalender', 'phone', 8, 2500, null, null, null],
			['/', 'phone', 5, 1000, 100, null, null],
			['/', 'desktop', 0, null, null, 300, 50]
		]);
	});

	it('takes the slowest interaction, leaving out one in fifty', () => {
		expect(inpOf([])).toBeNull();
		expect(inpOf([40, 300, 120])).toBe(300);
		expect(inpOf([...Array(60).fill(50), 900])).toBe(50);
	});
});
