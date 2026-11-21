import { describe, expect, it, vi } from 'vitest';
import { lazyFields } from './lazy.ts';

describe('lazyFields', () => {
	it('builds nothing until a field is read', () => {
		const a = vi.fn(() => 1);
		const b = vi.fn(() => 'two');
		lazyFields<{ a: number; b: string }>({ a, b });
		expect(a).not.toHaveBeenCalled();
		expect(b).not.toHaveBeenCalled();
	});

	it('builds only the field read, and only once', () => {
		const a = vi.fn(() => ({ list: [1, 2] }));
		const b = vi.fn(() => 'two');
		const fields = lazyFields<{ a: { list: number[] }; b: string }>({ a, b });
		const first = fields.a;
		expect(fields.a).toBe(first);
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).not.toHaveBeenCalled();
	});

	it('keeps a null or undefined result too', () => {
		const a = vi.fn(() => null);
		const fields = lazyFields<{ a: null }>({ a });
		expect(fields.a).toBeNull();
		expect(fields.a).toBeNull();
		expect(a).toHaveBeenCalledTimes(1);
	});

	it('works with destructuring and lists every field', () => {
		const fields = lazyFields<{ a: number; b: number }>({ a: () => 1, b: () => 2 });
		const { a, b } = fields;
		expect([a, b]).toEqual([1, 2]);
		expect(Object.keys(fields)).toEqual(['a', 'b']);
	});

	it('tries a builder that threw again on the next read', () => {
		let calls = 0;
		const fields = lazyFields<{ a: number }>({
			a: () => {
				if (++calls === 1) throw new Error('first');
				return 7;
			}
		});
		expect(() => fields.a).toThrow('first');
		expect(fields.a).toBe(7);
		expect(fields.a).toBe(7);
		expect(calls).toBe(2);
	});
});
