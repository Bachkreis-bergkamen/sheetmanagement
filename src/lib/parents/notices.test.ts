import { describe, expect, it } from 'vitest';
import { noticeFor, noticeFromForm } from './notices.ts';

const form = (entries: [string, string][]) => {
	const data = new FormData();
	for (const [name, value] of entries) data.append(name, value);
	return data;
};

describe('notices to parents', () => {
	it('reach the parents of children in their orchestras, or all of them', () => {
		expect(noticeFor({ orchestras: [] }, [['A']])).toBe(true);
		expect(noticeFor({ orchestras: ['JO'] }, [['A'], ['jo']])).toBe(true);
		expect(noticeFor({ orchestras: ['JO'] }, [['A']])).toBe(false);
		// A child without orchestras plays in all of them.
		expect(noticeFor({ orchestras: ['JO'] }, [[]])).toBe(true);
		expect(noticeFor({ orchestras: ['JO'] }, [])).toBe(false);
	});

	it('are read from the form, every orchestra ticked being all of them', () => {
		const by = { orchestras: ['A', 'JO'], byEmail: 'v@example.org', byName: 'Vera' };
		expect(noticeFromForm(form([['title', ' Probenfreizeit '], ['body', 'Bitte anmelden.'], ['orchestra', 'JO']]), by)).toEqual({
			notice: { title: 'Probenfreizeit', body: 'Bitte anmelden.', orchestras: ['JO'], byEmail: 'v@example.org', byName: 'Vera' }
		});
		const all = noticeFromForm(form([['title', 'T'], ['body', 'B'], ['orchestra', 'JO'], ['orchestra', 'A']]), by);
		expect('notice' in all && all.notice.orchestras).toEqual([]);
		expect(noticeFromForm(form([['title', ''], ['body', 'B']]), by)).toEqual({ problem: 'title' });
		expect(noticeFromForm(form([['title', 'T'], ['body', ' ']]), by)).toEqual({ problem: 'body' });
	});
});
