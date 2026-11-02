import { describe, expect, it } from 'vitest';
import { decodeMeta } from './parts.svelte.ts';

describe('decodeMeta', () => {
	it('reads piece and label from a saved copy', () => {
		const header = encodeURIComponent(JSON.stringify({ label: 'Violine II', piece: 'Brandenburgisches Konzert Nr. 3', pieceId: 'p1', glyph: 'violin' }));
		expect(decodeMeta('f1', header)).toEqual({ id: 'f1', label: 'Violine II', piece: 'Brandenburgisches Konzert Nr. 3', pieceId: 'p1', glyph: 'violin' });
	});

	it('gives nothing for copies saved without one, or a broken one', () => {
		expect(decodeMeta('f1', null)).toBeNull();
		expect(decodeMeta('f1', '%E0%A4%A')).toBeNull();
		expect(decodeMeta('f1', encodeURIComponent('{"label":1}'))).toBeNull();
	});
});
