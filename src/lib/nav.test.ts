import { describe, expect, it } from 'vitest';
import type { Right } from '#lib/access/access.ts';
import { ALL_ON } from '#lib/features.ts';
import { currentItem, isActive, movedPath, navGroups, primaryNav, workspaceOf } from './nav.ts';

const hrefs = (auth: 'on' | 'off', rights: Right[]) =>
	Object.fromEntries(navGroups({ auth, rights }).map((group) => [group.key, group.items.map((item) => item.href)]));

describe('navGroups', () => {
	it('shows members their music, the archive, wishes and their profile', () => {
		expect(hrefs('on', ['ansehen'])).toEqual({
			musik: ['/meine-noten', '/kalender', '/stuecke', '/chronik'],
			mitmachen: ['/wuensche', '/kummerkasten', '/profil']
		});
	});

	it('gives the people who look after the sheet music their own workspace', () => {
		const groups = navGroups({ auth: 'on', rights: ['ansehen', 'stuecke.bearbeiten'] });
		const pflege = groups.find((group) => group.key === 'pflege');
		expect(pflege?.workspace).toBe(true);
		expect(pflege?.items.map((item) => item.href)).toEqual(['/meldungen', '/fehlende-stimmen', '/stuecke/angaben', '/namen', '/leihmaterial']);
	});

	it('gives those who plan the programmes the ensembles, beside the sheet music', () => {
		expect(hrefs('on', ['ansehen', 'programme.bearbeiten']).pflege).toEqual(['/ensembles']);
		expect(hrefs('on', ['ansehen', 'stuecke.bearbeiten', 'programme.bearbeiten']).pflege?.at(-1)).toBe('/ensembles');
	});

	it('gives admins every page', () => {
		expect(hrefs('on', ['ansehen', 'stuecke.bearbeiten', 'mitglieder.verwalten']).verwaltung).toEqual(['/admin', '/einstellungen', '/setup', '/status']);
	});

	it('keeps setup and status reachable while sign-in is off, without wishes or admin', () => {
		const groups = hrefs('off', ['ansehen']);
		expect(groups.mitmachen).toBeUndefined();
		expect(groups.verwaltung).toEqual(['/setup', '/status']);
	});

	it('leaves out the pages of features that are off (#134)', () => {
		const features = { ...ALL_ON, loans: false, wishes: false };
		const groups = navGroups({ auth: 'on', rights: ['ansehen', 'stuecke.bearbeiten'], features });
		const hrefs = groups.flatMap((group) => group.items.map((item) => item.href));
		expect(hrefs).not.toContain('/leihmaterial');
		expect(hrefs).not.toContain('/wuensche');
		expect(hrefs).toContain('/profil');
	});

	it('accepts the rights as a set too', () => {
		expect(navGroups({ auth: 'on', rights: new Set<Right>(['stuecke.bearbeiten']) }).find((g) => g.key === 'pflege')?.items).toHaveLength(5);
	});
});

describe('currentItem and workspaceOf', () => {
	const groups = navGroups({ auth: 'on', rights: ['ansehen', 'stuecke.bearbeiten', 'mitglieder.verwalten'] });

	it('takes the most specific page', () => {
		expect(currentItem(groups, '/stuecke/angaben')?.item.href).toBe('/stuecke/angaben');
		expect(currentItem(groups, '/stuecke/abc/bearbeiten')?.item.href).toBe('/stuecke');
		expect(currentItem(groups, '/datenschutz')).toBeUndefined();
	});

	it('finds the workspace for its pages only', () => {
		expect(workspaceOf(groups, '/leihmaterial')?.key).toBe('pflege');
		expect(workspaceOf(groups, '/status')?.key).toBe('verwaltung');
		expect(workspaceOf(groups, '/stuecke')).toBeUndefined();
		expect(workspaceOf(groups, '/kalender/abc')).toBeUndefined();
	});
});

describe('primaryNav', () => {
	it('is home plus the pages members use most, at most five with "Mehr"', () => {
		const nav = primaryNav(navGroups({ auth: 'on', rights: ['ansehen', 'stuecke.bearbeiten', 'mitglieder.verwalten'] }));
		expect(nav.map((item) => item.href)).toEqual(['/', '/meine-noten', '/kalender', '/stuecke']);
	});
});

describe('isActive', () => {
	it('matches the page and pages below it, and home only exactly', () => {
		expect(isActive('/stuecke', '/stuecke/abc')).toBe(true);
		expect(isActive('/stuecke', '/stueckeliste')).toBe(false);
		expect(isActive('/', '/stuecke')).toBe(false);
		expect(isActive('/', '/')).toBe(true);
	});
});

describe('movedPath', () => {
	it('sends the old concert pages to the calendar', () => {
		expect(movedPath('/konzerte')).toBe('/kalender');
		expect(movedPath('/konzerte/abc')).toBe('/kalender/abc');
		expect(movedPath('/konzerte/abc/programm')).toBe('/kalender/abc/programm');
		expect(movedPath('/konzerte/abc/musikfolge.csv')).toBe('/kalender/abc/musikfolge.csv');
	});

	it('leaves other pages alone', () => {
		for (const path of ['/', '/kalender', '/kalender/abc.ics', '/konzertesaal', '/stuecke/konzerte']) expect(movedPath(path)).toBeNull();
	});
});
