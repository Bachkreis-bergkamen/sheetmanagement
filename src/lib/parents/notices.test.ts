import { describe, expect, it } from 'vitest';
import { noticeFor, noticeFromForm } from './notices.ts';

const form = (entries: [string, string][]) => {
	const data = new FormData();
	for (const [name, value] of entries) data.append(name, value);
	return data;
};

describe('notices to parents', () => {
	it('reach the parents of children in their orchestras, or all of them', () => {
		const kids = (...lists: string[][]) => lists.map((orchestras) => ({ orchestras }));
		expect(noticeFor({ orchestras: [] }, kids(['A']))).toBe(true);
		expect(noticeFor({ orchestras: ['JO'] }, kids(['A'], ['jo']))).toBe(true);
		expect(noticeFor({ orchestras: ['JO'] }, kids(['A']))).toBe(false);
		// A child without orchestras plays in all of them.
		expect(noticeFor({ orchestras: ['JO'] }, kids([]))).toBe(true);
		expect(noticeFor({ orchestras: ['JO'] }, [])).toBe(false);
	});

	it('about one date reach only the parents of those taking part (#299)', () => {
		const mia = { name: 'Mia', orchestras: ['JO'] };
		const jonas = { name: 'Jonas', orchestras: ['JO'] };
		const takesPart = (child: { name: string }, event: string) => event === 'konzert' && child.name === 'Mia';
		const notice = { orchestras: [], event: { id: 'konzert', label: 'Konzert · Sa 6. Dez' } };
		expect(noticeFor(notice, [jonas, mia], takesPart)).toBe(true);
		expect(noticeFor(notice, [jonas], takesPart)).toBe(false);
		// Without a way to tell, nobody: better than sending it to every parent.
		expect(noticeFor(notice, [mia])).toBe(false);
	});

	it('are read from the form, every orchestra ticked being all of them', () => {
		const by = { orchestras: ['A', 'JO'], byEmail: 'v@example.org', byName: 'Vera' };
		expect(noticeFromForm(form([['title', ' Probenfreizeit '], ['body', 'Bitte anmelden.'], ['orchestra', 'JO']]), by)).toEqual({
			notice: { title: 'Probenfreizeit', body: 'Bitte anmelden.', orchestras: ['JO'], event: null, byEmail: 'v@example.org', byName: 'Vera' }
		});
		const all = noticeFromForm(form([['title', 'T'], ['body', 'B'], ['orchestra', 'JO'], ['orchestra', 'A']]), by);
		expect('notice' in all && all.notice.orchestras).toEqual([]);
		expect(noticeFromForm(form([['title', ''], ['body', 'B']]), by)).toEqual({ problem: 'title' });
		expect(noticeFromForm(form([['title', 'T'], ['body', ' ']]), by)).toEqual({ problem: 'body' });
	});

	it('can be about one date, which then decides who reads them', () => {
		const dates = [{ id: 'konzert', label: 'Konzert · Sa 6. Dez' }];
		const by = { orchestras: ['A', 'JO'], dates, byEmail: 'v@example.org', byName: 'Vera' };
		const about = noticeFromForm(form([['title', 'Treffpunkt'], ['body', '17 Uhr am Hintereingang.'], ['event', 'konzert'], ['orchestra', 'JO']]), by);
		expect('notice' in about && about.notice).toMatchObject({ orchestras: [], event: dates[0] });
		// A date no longer in the calendar.
		expect(noticeFromForm(form([['title', 'T'], ['body', 'B'], ['event', 'gone']]), by)).toEqual({ problem: 'event' });
	});
});
