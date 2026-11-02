import { describe, expect, it } from 'vitest';
import { planProgramSave, parseEntries, programVersion } from '#lib/repertoire/program-edit.ts';
import { readTable } from '#lib/repertoire/sheet.ts';
import {
	buildAccessList,
	countingMembers,
	currentStatus,
	lacksSurname,
	maskEmail,
	missingRoles,
	planRoleRights,
	roleRights,
	parseDay,
	parseEmailList,
	parseStatus,
	planApproval,
	playsIn,
	resolveAccess,
	RIGHTS,
	seesDate
} from './access.ts';

const list = buildAccessList({
	members: [
		['E-Mail', 'Name', 'Instrument', 'Gruppen'],
		['Anna@Example.org', 'Anna', 'Geige', 'Vorstand, Geigen'],
		['ben@example.org', 'Ben', 'Cello', ''],
		['anna@example.org', 'Anna doppelt', '', '']
	],
	groups: [['Gruppe', 'Beschreibung'], ['Vorstand', 'Leitet den Verein']],
	rights: [
		['Wer', 'Recht'],
		['vorstand', 'mitglieder.verwalten'],
		['BEN@example.org', 'programme.bearbeiten'],
		['carl@example.org', 'programme.bearbeiten'],
		['Vorstand', 'alles']
	],
	requests: [['E-Mail', 'Name', 'Angefragt am'], ['Dora@Example.org', 'Dora', '2026-10-18']]
});

const user = (email: string) => ({ email, name: email });

describe('buildAccessList', () => {
	it('reads members, groups, grants and requests', () => {
		expect(list.present).toBe(true);
		expect(list.members.map((m) => [m.email, m.groups])).toEqual([
			['anna@example.org', ['Vorstand', 'Geigen']],
			['ben@example.org', []]
		]);
		expect(list.groups).toEqual([{ row: 2, name: 'Vorstand', description: 'Leitet den Verein' }]);
		expect(list.requests[0].email).toBe('dora@example.org');
		expect(list.problems.map((p) => [p.kind, p.row])).toEqual([
			['duplicate-member', 4],
			['unknown-right', 5]
		]);
	});

	it('copes with missing tabs', () => {
		const empty = buildAccessList({});
		expect(empty.present).toBe(false);
		expect(resolveAccess(user('anna@example.org'), empty, []).member).toBe(false);
	});
});

describe('resolveAccess', () => {
	it('gives members "ansehen" plus rights of their email and groups', () => {
		expect([...resolveAccess(user('ANNA@example.org'), list, []).rights]).toEqual(['ansehen', 'mitglieder.verwalten']);
		expect([...resolveAccess(user('ben@example.org'), list, []).rights]).toEqual(['ansehen', 'programme.bearbeiten']);
	});

	it('gives nothing to people not in "Mitglieder", even with a grant', () => {
		const carl = resolveAccess(user('carl@example.org'), list, []);
		expect(carl.member).toBe(false);
		expect(carl.rights.size).toBe(0);
		expect(resolveAccess(null, list, []).member).toBe(false);
	});

	it('gives bootstrap admins every right, even without a sheet', () => {
		const admin = resolveAccess(user('Root@Example.org'), null, parseEmailList('root@example.org, second@example.org'));
		expect(admin.bootstrapAdmin).toBe(true);
		expect([...admin.rights]).toEqual([...RIGHTS]);
	});
});

describe('programme editor', () => {
	const programColumns = {
		concert: 'Konzert',
		position: 'Nr.',
		piece: 'Stück',
		notes: 'Notiz',
		orchestra: 'Orchester',
		composer: 'Komponist',
		arranger: 'Arrangeur',
		publisher: 'Verlag',
		duration: 'Dauer'
	};
	const table = readTable(
		[
			['Konzert', 'Nr.', 'Stück', 'Notiz', 'Orchester'],
			['Herbstkonzert 2026', '1', 'Bolero', ''],
			['Weihnachtskonzert 2026', '1', 'Sleigh Ride', ''],
			['herbstkonzert 2026', '2', 'Jesu bleibet meine Freude', 'Zugabe'],
			['Herbstkonzert 2026', '1', 'Fame', '', 'A']
		],
		programColumns
	);
	const eo = { orchestra: 'EO', orchestras: ['EO', 'A'] };
	const a = { orchestra: 'A', orchestras: ['EO', 'A'] };

	it('accepts only well-formed entries', () => {
		expect(parseEntries('[{"piece":" Bolero ","notes":""}]')).toEqual([{ piece: 'Bolero', notes: '' }]);
		expect(parseEntries('[{"piece":""}]')).toBeNull();
		expect(parseEntries('{"piece":"Bolero"}')).toBeNull();
		expect(parseEntries('not json')).toBeNull();
	});

	it('detects changes made in the meantime', () => {
		const before = programVersion(table, 'Herbstkonzert 2026');
		const changed = { ...table, rows: table.rows.map((r) => (r.row === 4 ? { ...r, values: { ...r.values, notes: '' } } : r)) };
		expect(programVersion(changed, 'Herbstkonzert 2026')).not.toBe(before);
		expect(programVersion(changed, 'Weihnachtskonzert 2026')).toBe(programVersion(table, 'Weihnachtskonzert 2026'));
	});

	it('replaces only this concert\'s rows, numbered in the new order', () => {
		const plan = planProgramSave(table, 'Herbstkonzert 2026', [
			{ piece: 'Jesu bleibet meine Freude', notes: 'Zugabe' },
			{ piece: 'Bolero', notes: '' }
		]);
		expect(plan.remove).toEqual([2, 4, 5]);
		expect(plan.append).toEqual([
			{ concert: 'Herbstkonzert 2026', position: '1', piece: 'Jesu bleibet meine Freude', notes: 'Zugabe' },
			{ concert: 'Herbstkonzert 2026', position: '2', piece: 'Bolero', notes: '' }
		]);
	});

	it('replaces only one orchestra\'s rows; rows without one are played together', () => {
		const plan = planProgramSave(table, 'Herbstkonzert 2026', [{ piece: 'Skyfall', notes: '' }], a);
		expect(plan.remove).toEqual([5]);
		expect(plan.append).toEqual([{ concert: 'Herbstkonzert 2026', position: '1', piece: 'Skyfall', notes: '', orchestra: 'A' }]);
		expect(planProgramSave(table, 'Herbstkonzert 2026', [], eo).remove).toEqual([]);
		expect(planProgramSave(table, 'Herbstkonzert 2026', [], { orchestra: 'EO, A', orchestras: ['EO', 'A'] }).remove).toEqual([2, 4]);
	});

	it('notices changes only in the orchestra being edited', () => {
		const changed = { ...table, rows: table.rows.map((r) => (r.row === 5 ? { ...r, values: { ...r.values, piece: 'Skyfall' } } : r)) };
		expect(programVersion(changed, 'Herbstkonzert 2026', eo)).toBe(programVersion(table, 'Herbstkonzert 2026', eo));
		expect(programVersion(changed, 'Herbstkonzert 2026', a)).not.toBe(programVersion(table, 'Herbstkonzert 2026', a));
	});

	it('keeps pieces played together apart from each orchestra’s own', () => {
		const joint = readTable(
			[
				['Konzert', 'Nr.', 'Stück', 'Notiz', 'Orchester'],
				['Herbstkonzert 2026', '1', 'Bolero', ''],
				['Herbstkonzert 2026', '1', 'Finale', '', 'A, EO']
			],
			programColumns
		);
		const together = { orchestra: 'EO, A', orchestras: ['EO', 'A'] };
		// The row naming no orchestra is played together too, so EO's own programme is empty.
		expect(planProgramSave(joint, 'Herbstkonzert 2026', [], eo).remove).toEqual([]);
		const plan = planProgramSave(joint, 'Herbstkonzert 2026', [{ piece: 'Radetzky', notes: '' }], together);
		expect(plan.remove).toEqual([2, 3]);
		expect(plan.append[0]).toMatchObject({ piece: 'Radetzky', orchestra: 'EO, A' });
	});

	it('keeps a guest ensemble’s rows apart and saves what a guest piece says itself', () => {
		const shared = readTable(
			[
				['Konzert', 'Nr.', 'Stück', 'Notiz', 'Orchester', 'Komponist', 'Arrangeur', 'Verlag', 'Dauer'],
				['Herbstkonzert 2026', '1', 'Bolero', ''],
				['Herbstkonzert 2026', '1', 'Abendlied', '', 'kch', 'Josef Rheinberger', '', 'Carus', '3:10'],
				['Herbstkonzert 2026', '1', 'Halleluja', '', 'KCH, EO']
			],
			programColumns
		);
		const guests = { orchestra: 'KCH', orchestras: ['EO'], partners: ['KCH'] };
		const ours = { orchestra: 'EO', orchestras: ['EO'], partners: ['KCH'] };
		// A row naming nobody stays ours; the guests' rows always name them.
		expect(planProgramSave(shared, 'Herbstkonzert 2026', [], ours).remove).toEqual([2]);
		expect(planProgramSave(shared, 'Herbstkonzert 2026', [], { ...ours, orchestra: 'EO, KCH' }).remove).toEqual([4]);
		const plan = planProgramSave(
			shared,
			'Herbstkonzert 2026',
			[{ piece: 'Abendlied', notes: '', composer: 'Josef Rheinberger', publisher: 'Carus', duration: '3:10' }],
			guests
		);
		expect(plan.remove).toEqual([3]);
		expect(plan.append).toEqual([
			{ concert: 'Herbstkonzert 2026', position: '1', piece: 'Abendlied', notes: '', orchestra: 'KCH', composer: 'Josef Rheinberger', publisher: 'Carus', duration: '3:10' }
		]);
		// With guests, our own rows name us too, so "EO" and "EO, KCH" stay apart.
		expect(planProgramSave(shared, 'Herbstkonzert 2026', [{ piece: 'Bolero', notes: '' }], ours).append[0]).toMatchObject({ orchestra: 'EO' });
		// A guest piece's details count as a change.
		const changed = { ...shared, rows: shared.rows.map((r) => (r.row === 3 ? { ...r, values: { ...r.values, publisher: 'Bärenreiter' } } : r)) };
		expect(programVersion(changed, 'Herbstkonzert 2026', guests)).not.toBe(programVersion(shared, 'Herbstkonzert 2026', guests));
	});

	it('reads what a guest piece says about itself', () => {
		expect(parseEntries('[{"piece":"Abendlied","notes":"","composer":" Josef Rheinberger ","arranger":"","duration":"3:10"}]')).toEqual([
			{ piece: 'Abendlied', notes: '', composer: 'Josef Rheinberger', duration: '3:10' }
		]);
		expect(parseEntries('[{"piece":"Abendlied","composer":3}]')).toBeNull();
	});

	it('names no orchestra on the rows of a concert one orchestra plays', () => {
		const plan = planProgramSave(table, 'Weihnachtskonzert 2026', [{ piece: 'Sleigh Ride', notes: '' }], { orchestra: 'EO', orchestras: ['EO'] });
		expect(plan.append[0]).not.toHaveProperty('orchestra');
	});
});

describe('planApproval', () => {
	const requests = [
		{ row: 2, email: 'Anna@Example.org', name: 'Anna' },
		{ row: 3, email: 'ben@example.org', name: 'Ben' },
		{ row: 4, email: 'anna@example.org', name: 'Anna B.' },
		{ row: 5, email: 'cleo@example.org', name: 'Cleo' }
	];

	it('approves one request, removing every row of that email', () => {
		expect(planApproval([], requests, ['anna@example.org'])).toEqual({ add: [{ email: 'anna@example.org', name: 'Anna' }], remove: [2, 4] });
	});

	it('approves all shown requests at once, but not one that arrived meanwhile', () => {
		const plan = planApproval(['ben@example.org'], requests, ['anna@example.org', 'BEN@example.org']);
		// Ben already is a member: his request goes, no second member row.
		expect(plan).toEqual({ add: [{ email: 'anna@example.org', name: 'Anna' }], remove: [2, 3, 4] });
	});

	it('does nothing for a request that is gone', () => {
		expect(planApproval([], requests, ['dora@example.org'])).toEqual({ add: [], remove: [] });
	});
});

describe('maskEmail and lacksSurname', () => {
	it('keeps the start and the domain of an email', () => {
		expect(maskEmail('anna.mueller@gmail.com')).toBe('an…@gmail.com');
		expect(maskEmail('ab@x.org')).toBe('a…@x.org');
		expect(maskEmail('Vorstand')).toBe('Vorstand');
	});

	it('spots names without a surname', () => {
		expect(lacksSurname('Anna')).toBe(true);
		expect(lacksSurname(' Anna ')).toBe(true);
		expect(lacksSurname('Anna Müller')).toBe(false);
		expect(lacksSurname('anna@example.org')).toBe(false);
	});
});

describe('member status and orchestras', () => {
	const members = buildAccessList({
		members: [
			['E-Mail', 'Name', 'Instrument', 'Gruppen', 'Orchester', 'Status', 'Pausiert bis'],
			['a@example.org', 'Anna A', 'Geige I & II', '', 'EO, A', '', ''],
			['b@example.org', 'Ben B', 'Cello', '', '', 'Pausiert', '31.3.2027'],
			['c@example.org', 'Carl C', 'Horn', '', 'a', 'inaktiv', ''],
			['d@example.org', 'Dora D', 'Oboe', '', 'B', 'pausiert', '']
		]
	}).members;

	it('reads orchestras, status and the end of a pause', () => {
		expect(members.map((m) => [m.orchestras, m.status, m.pausedUntil])).toEqual([
			[['EO', 'A'], 'aktiv', undefined],
			[[], 'pausiert', '2027-03-31'],
			[['a'], 'inaktiv', undefined],
			[['B'], 'pausiert', undefined]
		]);
	});

	it.each([
		['', 'aktiv'],
		['Aktiv', 'aktiv'],
		['pausiert', 'pausiert'],
		['Pause', 'pausiert'],
		['INAKTIV', 'inaktiv'],
		['nur Verwaltung', 'verwaltung'],
		['Verwaltung', 'verwaltung'],
		['Admin', 'verwaltung'],
		['weg', 'aktiv']
	])('status %j → %s', (text, status) => {
		expect(parseStatus(text)).toBe(status);
	});

	it.each([
		['2027-03-31', '2027-03-31'],
		['2027-3-1', '2027-03-01'],
		['1.3.2027', '2027-03-01'],
		['31.2.2027', undefined],
		['März', undefined],
		['', undefined]
	])('day %j → %j', (text, day) => {
		expect(parseDay(text)).toBe(day);
	});

	it('ends a pause the day after its date', () => {
		const paused = { status: 'pausiert' as const, pausedUntil: '2027-03-31' };
		expect(currentStatus(paused, '2027-03-31')).toBe('pausiert');
		expect(currentStatus(paused, '2027-04-01')).toBe('aktiv');
		expect(currentStatus({ status: 'pausiert' }, '2099-01-01')).toBe('pausiert');
		expect(currentStatus({ status: 'inaktiv', pausedUntil: '2020-01-01' }, '2027-01-01')).toBe('inaktiv');
	});

	it('counts members without orchestras for every orchestra', () => {
		expect(playsIn(members[0], 'A')).toBe(true);
		expect(playsIn(members[0], 'B')).toBe(false);
		expect(playsIn(members[1], 'B')).toBe(true);
		expect(playsIn(members[3], undefined)).toBe(true);
	});

	it('counts members of any orchestra a concert names', () => {
		expect(playsIn(members[2], 'EO, A')).toBe(true);
		expect(playsIn(members[3], 'B; A')).toBe(true);
		expect(playsIn(members[3], 'EO, A')).toBe(false);
	});

	it('shows a rehearsal only to members of its orchestras, other dates to everyone', () => {
		const eo = { orchestras: ['EO'] };
		const both = { orchestras: ['EO', 'A'] };
		const probe = { type: 'probe' };
		expect(seesDate(eo, probe, 'A')).toBe(false);
		expect(seesDate(both, probe, 'A')).toBe(true);
		expect(seesDate(eo, { type: 'generalprobe' }, 'A')).toBe(false);
		// Played together, or nothing set: for everyone.
		expect(seesDate(eo, probe, 'EO, A')).toBe(true);
		expect(seesDate(eo, probe, undefined)).toBe(true);
		// Without orchestras a member is in all of them; without a member row, everything shows.
		expect(seesDate({ orchestras: [] }, probe, 'A')).toBe(true);
		expect(seesDate(undefined, probe, 'A')).toBe(true);
		expect(seesDate(eo, { type: 'konzert' }, 'A')).toBe(true);
	});

	it('counts only active members of the concert orchestra', () => {
		expect(countingMembers(members, 'A', '2027-01-01').map((m) => m.name)).toEqual(['Anna A']);
		expect(countingMembers(members, 'A', '2027-04-01').map((m) => m.name)).toEqual(['Anna A', 'Ben B']);
		expect(countingMembers(members, undefined, '2027-04-01').map((m) => m.name)).toEqual(['Anna A', 'Ben B']);
	});
});

describe('roles', () => {
	const access = buildAccessList({
		groups: [['Gruppe', 'Beschreibung'], ['Dirigat', ''], ['Vorstand', ''], ['Geigen', '']],
		rights: [
			['Wer', 'Recht'],
			['dirigat', 'programme.bearbeiten'],
			['Dirigat', 'anmeldungen.sehen'],
			['Vorstand', 'mitglieder.verwalten'],
			['anna@example.org', 'stuecke.bearbeiten']
		]
	});

	it('collects the rights of each group, in the usual order', () => {
		expect(Object.fromEntries(roleRights(access))).toEqual({
			Dirigat: ['programme.bearbeiten', 'anmeldungen.sehen'],
			Vorstand: ['mitglieder.verwalten'],
			Geigen: []
		});
	});

	it('plans the rows to add and remove for a role', () => {
		const rows = [
			{ row: 2, who: 'dirigat', right: 'programme.bearbeiten' },
			{ row: 3, who: 'Dirigat', right: 'anmeldungen.sehen' },
			{ row: 4, who: 'Dirigat', right: 'programme.bearbeiten' },
			{ row: 5, who: 'anna@example.org', right: 'programme.bearbeiten' }
		];
		expect(planRoleRights(rows, 'Dirigat', ['programme.bearbeiten', 'stuecke.bearbeiten'])).toEqual({
			add: ['stuecke.bearbeiten'],
			remove: [3, 4]
		});
		expect(planRoleRights(rows, 'Dirigat', [])).toEqual({ add: [], remove: [2, 3, 4] });
	});

	it('offers only preset roles that are missing', () => {
		const presets = [
			{ name: 'dirigat', description: '', rights: [] },
			{ name: 'Orga', description: '', rights: [] }
		];
		expect(missingRoles(presets, access.groups).map((role) => role.name)).toEqual(['Orga']);
	});
});
