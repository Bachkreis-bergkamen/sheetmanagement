import { describe, expect, it } from 'vitest';
import type { Right } from '#lib/access/access.ts';
import { ALL_ON } from '#lib/features.ts';
import { currentItem, inOrganiserArea, isActive, menuGroups, movedPath, navGroups, primaryNav, workspaceOf } from './nav.ts';

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
	it('gives members four places: home, their parts, the calendar and their profile (#185)', () => {
		expect(primaryNav(navGroups({ auth: 'on', rights: ['ansehen'] })).map((item) => item.href)).toEqual(['/', '/meine-noten', '/kalender', '/profil']);
	});

	it("gives organisers their area in the profile's place, which stays behind the avatar", () => {
		const nav = primaryNav(navGroups({ auth: 'on', rights: ['ansehen', 'stuecke.bearbeiten', 'mitglieder.verwalten'] }));
		expect(nav.map((item) => item.href)).toEqual(['/', '/meine-noten', '/kalender', '/verwaltung']);
		expect(primaryNav(navGroups({ auth: 'on', rights: ['ansehen', 'programme.bearbeiten'] })).at(-1)?.href).toBe('/verwaltung');
	});

	it('keeps the area while sign-in is off, for setting the app up', () => {
		expect(primaryNav(navGroups({ auth: 'off', rights: ['ansehen'] })).map((item) => item.href)).toEqual(['/', '/meine-noten', '/kalender', '/verwaltung']);
	});
});

describe('menuGroups', () => {
	it("lists the members' groups and the organisers' area as one entry, not its pages", () => {
		const menu = menuGroups(navGroups({ auth: 'on', rights: ['ansehen', 'stuecke.bearbeiten', 'mitglieder.verwalten'] }));
		expect(menu.map((group) => group.key)).toEqual(['musik', 'mitmachen', 'bereich']);
		expect(menu.at(-1)?.items.map((item) => item.href)).toEqual(['/verwaltung']);
	});

	it('has no area for members', () => {
		expect(menuGroups(navGroups({ auth: 'on', rights: ['ansehen'] })).map((group) => group.key)).toEqual(['musik', 'mitmachen']);
	});
});

describe('inOrganiserArea', () => {
	const groups = navGroups({ auth: 'on', rights: ['ansehen', 'stuecke.bearbeiten', 'mitglieder.verwalten'] });

	it("holds for the hub and the organisers' pages, not for the members' ones", () => {
		for (const path of ['/verwaltung', '/meldungen', '/stuecke/angaben', '/admin', '/status']) expect(inOrganiserArea(groups, path)).toBe(true);
		for (const path of ['/', '/stuecke', '/stuecke/abc', '/kalender', '/profil']) expect(inOrganiserArea(groups, path)).toBe(false);
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
