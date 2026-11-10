import { describe, expect, it } from 'vitest';
import { bachkreis } from '#lib/config/presets/bachkreis.ts';
import type { DriveIndex, IndexedFile } from '#lib/server/drive-index.ts';
import { buildCatalog } from './catalog.ts';
import { workKey } from './piece-name.ts';
import { compareSections, sectionName, sharedMovement } from './sections.ts';

describe('sectionName', () => {
	it.each([
		['1er Satz', '1. Satz', 'movement'],
		['4ter Satz', '4. Satz', 'movement'],
		['2. Satz', '2. Satz', 'movement'],
		['Satz 3', '3. Satz', 'movement'],
		['Komplett', 'Komplett', 'complete'],
		['Gesamtausgabe', 'Komplett', 'complete'],
		['Sections', 'Sections', 'other']
	])('%j → %j (%s)', (folder, label, kind) => {
		expect(sectionName(folder)).toMatchObject({ label, kind });
	});

	it('finds the movement all played files share', () => {
		expect(sharedMovement(['Mendelssohn 4 - Satz 2 - Flöte I.pdf', '@Mendelssohn 4 - Satz 2 - Partitur.pdf'])).toBe(2);
		expect(sharedMovement(['Satz 2 - Flöte.pdf', 'Satz 3 - Oboe.pdf'])).toBeUndefined();
		expect(sharedMovement(['Fame - Flöte.pdf'])).toBeUndefined();
	});

	it('orders played, movements, other folders, complete work', () => {
		const names = [sectionName('Komplett'), sectionName('4ter Satz'), sectionName('Extras'), sectionName('1er Satz')];
		const played = { label: '2. Satz', kind: 'played' as const, movement: 2 };
		expect([...names, played].sort(compareSections).map((s) => s.label)).toEqual([
			'2. Satz',
			'1. Satz',
			'4. Satz',
			'Extras',
			'Komplett'
		]);
	});
});

const pdf = (id: string, name: string, subfolder?: [string, string]): IndexedFile => ({
	id,
	name,
	mimeType: 'application/pdf',
	...(subfolder ? { subfolderId: subfolder[0], subfolder: subfolder[1] } : {})
});

const index: DriveIndex = {
	version: 3,
	archiveFolderId: 'archive',
	builtAt: '2026-10-18T00:00:00Z',
	requestCount: 0,
	programs: ['A-Orchester'],
	categoryFiles: [{ category: 'Weihnachtsstücke', files: [pdf('plan', 'Ablaufplan-Weihnachten.pdf')] }],
	pieces: [
		{
			folderId: 'mendelssohn',
			name: 'Mendelssohn Op. 90 - Sinfonie Nr. 4 Italienische',
			programs: ['A-Orchester'],
			files: [
				pdf('m1', '@Mendelssohn 4 - Satz 2 - Partitur.pdf'),
				pdf('m2', 'Mendelssohn 4 - Satz 2 - Flöte I.pdf'),
				pdf('m3', 'Mendelssohn 4 - Satz 2 - Geige I.pdf'),
				pdf('k1', '@Mendelssohn 4 - Partitur.pdf', ['komplett', 'Komplett']),
				pdf('k2', 'Mendelssohn 4 - Flöte I.pdf', ['komplett', 'Komplett']),
				pdf('k3', 'Mendelssohn 4 - Geige I.pdf', ['komplett', 'Komplett']),
				pdf('k4', 'Mendelssohn 4 - Pauke.pdf', ['komplett', 'Komplett'])
			]
		},
		{
			folderId: 'dvorak',
			name: 'Dvorak Op. 95 - Sinfonie Nr. 9 Aus der neuen Welt',
			files: [
				pdf('d1', 'Dvorak_9-1_Viola.pdf', ['s1', '1er Satz']),
				pdf('d2', 'Dvorak_9-1_Cello.pdf', ['s1', '1er Satz']),
				pdf('d3', '@Dvorak_9-4_Partitur.pdf', ['s4', '4ter Satz']),
				pdf('d4', 'Dvorak_9-4_Viola.pdf', ['s4', '4ter Satz'])
			]
		},
		{ folderId: 'fame', name: 'Fame', files: [pdf('f1', 'Fame - Flöte.pdf'), pdf('f2', 'Fame - Geige I.pdf')] }
	]
};

describe('catalog sections', () => {
	const catalog = buildCatalog(index, bachkreis);

	it('puts what is played first and the complete work last, and counts only what is played', () => {
		const piece = catalog.byId.get('mendelssohn')!;
		expect(piece.sections.map((s) => [s.label, s.kind, s.partCount, s.folderId])).toEqual([
			['2. Satz', 'played', 3, 'mendelssohn'],
			['Komplett', 'complete', 4, 'komplett']
		]);
		expect(piece.partCount).toBe(3);
		// Each section's parts are parsed on their own, so labels are clean.
		expect(piece.parts.filter((p) => p.section === '').map((p) => p.label)).toEqual(['Partitur', 'Flöte I', 'Geige I']);
	});

	it('marks a piece with parts but no score as "Partitur fehlt"', () => {
		expect(catalog.byId.get('fame')!.noScore).toBe(true);
		expect(catalog.byId.get('mendelssohn')!.noScore).toBeUndefined();
	});

	it('gives each movement its own section, without repeating "Satz N" on every part', () => {
		const piece = catalog.byId.get('dvorak')!;
		expect(piece.sections.map((s) => s.label)).toEqual(['1. Satz', '4. Satz']);
		expect(piece.parts.every((p) => !p.notes.some((note) => note.startsWith('Satz')))).toBe(true);
		expect(piece.parts.filter((p) => p.section === 's4').map((p) => p.label)).toEqual(['Partitur', 'Bratsche']);
	});

	it('keeps a plain piece as one unnamed section', () => {
		const piece = catalog.byId.get('fame')!;
		expect(piece.sections).toEqual([{ key: '', label: '', kind: 'played', folderId: 'fame', partCount: 2 }]);
	});

	it('keeps loose files of category folders', () => {
		expect(catalog.categoryFiles['Weihnachtsstücke'].map((f) => f.name)).toEqual(['Ablaufplan-Weihnachten.pdf']);
	});
});

describe('workKey', () => {
	it('finds the same numbered work in differently written titles', () => {
		expect(workKey('Sinfonie Nr. 4 Italienische')).toBe('sinfonie 4');
		expect(workKey('Sinfonie Nr4 Satz 2 - Streicherbesetzung')).toBe('sinfonie 4');
		expect(workKey('Sinfonie Nr. 5 Reformation')).toBe('sinfonie 5');
		expect(workKey('Brandenburgisches Konzert Nr. 3')).toBe('brandenburgisches konzert 3');
	});

	it('gives nothing for titles without a number', () => {
		expect(workKey('Jesu bleibet meine Freude')).toBeUndefined();
		expect(workKey('Nr. 5')).toBeUndefined();
	});
});
