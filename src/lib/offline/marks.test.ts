import { describe, expect, it } from 'vitest';
import type { Stroke } from '#lib/practice/marks.ts';
import { mergeMarks } from './marks.ts';

const line = (x: number) => ({ color: 'graphite', points: [x, x, x + 1, x + 1] }) as unknown as Stroke;

describe('mergeMarks', () => {
	const server = { 1: [line(1)], 2: [line(2)] };

	it('puts pages drawn offline and not sent yet over the server’s', () => {
		const kept = { 2: { strokes: [line(20)], pending: true }, 3: { strokes: [line(3)], pending: true } };
		expect(mergeMarks(server, kept, true)).toEqual({ 1: [line(1)], 2: [line(20)], 3: [line(3)] });
	});

	it('online, trusts the server for pages already sent: another device may have drawn since', () => {
		expect(mergeMarks(server, { 1: { strokes: [line(10)], pending: false } }, true)).toEqual(server);
	});

	it('offline, the page may be days old, so every page this device knows wins', () => {
		expect(mergeMarks(server, { 1: { strokes: [line(10)], pending: false } }, false)).toEqual({ 1: [line(10)], 2: [line(2)] });
	});

	it('keeps an emptied page empty', () => {
		expect(mergeMarks(server, { 1: { strokes: [], pending: true } }, true)[1]).toEqual([]);
	});
});
