import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessList, Member, Right } from '#lib/access/access.ts';
import { memoryStore } from './db/memory.ts';
import type { Store } from './db/types.ts';

let store: Store;
vi.mock('./db/index.ts', () => ({ getStore: () => store }));
vi.mock('./members.ts', () => ({ today: () => '2026-11-12' }));
vi.mock('./repertoire.ts', () => ({ getAccessList: async () => null }));

const { boardFor, childrenDrills, leaderOverview, sharingState } = await import('./drills.ts');

const member = (email: string, name: string, orchestras: string[] = ['EO'], children: string[] = []): Member =>
	({ row: 0, email, name, groups: [], roles: [], orchestras, status: children.length ? 'eltern' : 'aktiv', children, linkVersion: 0, feedVersion: 0 }) as Member;

function listOf(...members: Member[]): AccessList {
	return { present: true, members, membersByEmail: new Map(members.map((each) => [each.email, each])), groups: [], grants: [], requests: [], tables: {}, problems: [] };
}

const kid = member('kid@x', 'Kim Kind');
const mum = member('mum@x', 'Mara Mutter', [], ['kid@x']);
const anna = member('anna@x', 'Anna Alt');
const ben = member('ben@x', 'Ben Bach', ['B']);
const list = listOf(kid, mum, anna, ben);
const row = (day: string) => ({ day, skill: 'notes', answers: 10, right: 8, seconds: 120 });

beforeEach(() => {
	store = memoryStore();
});

describe('sharing on the server', () => {
	it('keeps a young player off the board until a parent agrees', async () => {
		await store.setDrillSharing('kid@x', { board: true, leaders: true, parents: true });
		expect((await sharingState(list, 'kid@x')).effective).toEqual({ board: false, leaders: false, parents: true });
		await store.setDrillConsent('kid@x', 'mum@x', true);
		expect((await sharingState(list, 'kid@x')).effective).toEqual({ board: true, leaders: true, parents: true });
		// A consent from someone who isn't (or no longer is) the child's parent doesn't count.
		await store.setDrillConsent('kid@x', 'anna@x', true);
		expect((await sharingState(list, 'kid@x')).effective.board).toBe(false);
	});

	it('shows the board only to those on it, with others of their orchestras', async () => {
		await store.setDrillSharing('anna@x', { board: true, leaders: false, parents: false });
		await store.setDrillSharing('ben@x', { board: true, leaders: false, parents: false });
		await store.saveDrillDays('anna@x', [row('2026-11-10'), row('2026-11-12'), row('2026-11-01')]);
		const board = await boardFor(list, 'anna@x', await sharingState(list, 'anna@x'));
		// Ben plays in B only, so he's not on Anna's board.
		expect(board?.entries).toEqual([{ name: 'Anna', days: 2, met: false, me: true, place: 1 }]);
		expect(await boardFor(list, 'kid@x', await sharingState(list, 'kid@x'))).toBeNull();
	});

	it('lists for leaders only members who share with them, in their orchestras', async () => {
		await store.setDrillSharing('anna@x', { board: false, leaders: true, parents: false });
		await store.setDrillSharing('ben@x', { board: false, leaders: true, parents: false });
		await store.setDrillSharing('kid@x', { board: false, leaders: true, parents: false });
		await store.saveDrillDays('anna@x', [row('2026-11-12')]);
		const scoped = { rights: new Set<Right>(['ansehen', 'ueben.begleiten']), scopes: new Map<Right, string[]>([['ueben.begleiten', ['EO']]]) };
		const seen = await leaderOverview(scoped, list);
		expect(seen.map((each) => each.name)).toEqual(['Anna Alt']);
		expect(seen[0].overview).toMatchObject({ days: 1, answers: 10, minutes: 2 });
		expect(await leaderOverview({ rights: new Set<Right>(['ansehen']) }, list)).toEqual([]);
	});

	it('gives parents their child’s summary only when shared with them', async () => {
		await store.saveDrillDays('kid@x', [row('2026-11-12')]);
		await store.setDrillSharing('kid@x', { board: true, leaders: false, parents: false });
		expect((await childrenDrills(list, 'mum@x', [kid]))[0]).toMatchObject({ consented: false, overview: null });
		await store.setDrillSharing('kid@x', { board: true, leaders: false, parents: true });
		await store.saveDrillDays('kid@x', [row('2026-11-12')]);
		await store.setDrillConsent('kid@x', 'mum@x', true);
		expect((await childrenDrills(list, 'mum@x', [kid]))[0]).toMatchObject({ consented: true, overview: { days: 1 } });
	});
});
