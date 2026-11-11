import { describe, expect, it } from 'vitest';
import { config } from '#lib/config/index.ts';
import { layoutSeating, MARKER, sectionsFromBesetzung, standRows, type BesetzungVoice, type SeatingPlan } from './seating.ts';

const families = new Map(config.instruments.map((instrument) => [instrument.name, instrument.family]));
const voice = (text: string): BesetzungVoice => {
	const [, instrument, numbers] = /^(.+?)(?: ([\d&\s]+))?$/.exec(text)!;
	return { instrument, numbers: numbers ? numbers.split('&').map((n) => Number(n.trim())) : [] };
};
const sections = (texts: string[], extra: { missing?: string[]; soloists?: string[]; counts?: Record<string, number> } = {}) =>
	sectionsFromBesetzung({
		voices: texts.map(voice),
		missing: (extra.missing ?? []).map(voice),
		soloists: extra.soloists,
		counts: extra.counts,
		familyOf: (name) => families.get(name),
		abbr: (name) => name.slice(0, 3),
		title: (v) => `${v.instrument} ${v.numbers.join(' & ')}`.trim(),
		soloLabel: 'Solo'
	});
const plan = (texts: string[], extra = {}) => layoutSeating(sections(texts, extra));

const CHAMBER = ['Flöte 1 & 2', 'Oboe 1 & 2', 'Geige 1 & 2', 'Viola', 'Violoncello', 'Kontrabass'];
const CLASSICAL = ['Flöte 1 & 2', 'Oboe 1 & 2', 'Klarinette 1 & 2', 'Fagott 1 & 2', 'Horn 1 & 2', 'Trompete 1 & 2', 'Pauke', ...CHAMBER.slice(2)];
const SYMPHONY = [
	'Piccolo',
	'Flöte 1 & 2 & 3',
	'Oboe 1 & 2 & 3',
	'Englischhorn',
	'Klarinette 1 & 2 & 3',
	'Bassklarinette',
	'Fagott 1 & 2 & 3',
	'Horn 1 & 2 & 3 & 4',
	'Trompete 1 & 2 & 3',
	'Posaune 1 & 2',
	'Bassposaune',
	'Tuba',
	'Pauke',
	'Schlagwerk 1 & 2 & 3',
	'Becken',
	'Bass Drum',
	'Harfe 1 & 2',
	'Klavier',
	...CHAMBER.slice(2)
];
const BAND = ['Flöte', 'Klarinette 1 & 2 & 3', 'Alt-Saxophon 1 & 2', 'Tenor-Saxophon', 'Trompete 1 & 2 & 3', 'Posaune 1 & 2', 'Tuba', 'Schlagwerk', 'Glockenspiel'];

const reach = (seat: { x: number; y: number }) => Math.hypot(seat.x, seat.y / plan(['Flöte']).flat);

function noOverlaps(result: SeatingPlan) {
	for (const [i, a] of result.seats.entries()) {
		for (const b of result.seats.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id} / ${b.id}`).toBeGreaterThan(2 * MARKER + 0.15);
	}
	for (const [i, a] of result.labels.entries()) {
		for (const b of result.labels.slice(i + 1)) {
			const apart = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 1e-6 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 - 1e-6;
			expect(apart, `${a.section} / ${b.section}`).toBe(true);
		}
	}
}

describe('the seating plan', () => {
	it('gives every player a chair, sections and labels never on top of each other', () => {
		for (const texts of [CHAMBER, CLASSICAL, SYMPHONY, BAND, ['Geige 1 & 2'], ['Flöte'], ['Pauke', 'Harfe', 'Orgel', 'Chor']]) {
			const made = sections(texts);
			const result = layoutSeating(made);
			expect(result.seats.length).toBe(made.reduce((sum, section) => sum + section.players, 0));
			noOverlaps(result);
		}
	});

	it('grows with the orchestra: more rows and a wider plan for a symphony than for a chamber orchestra', () => {
		const small = plan(CHAMBER);
		const middle = plan(CLASSICAL);
		const large = plan(SYMPHONY);
		expect(small.rows).toBeLessThan(middle.rows);
		expect(middle.rows).toBeLessThan(large.rows);
		expect(small.box.w).toBeLessThan(large.box.w);
		expect(small.seats.length).toBeLessThan(middle.seats.length);
	});

	it('estimates the strings from the winds when nothing says how many', () => {
		const count = (texts: string[], id: string) => sections(texts).find((section) => section.id === id)!.players;
		expect(count(CHAMBER, 'Geige:1')).toBeLessThan(count(SYMPHONY, 'Geige:1'));
		expect(count(SYMPHONY, 'Geige:1')).toBeGreaterThanOrEqual(count(SYMPHONY, 'Geige:2'));
		expect(count(CHAMBER, 'Kontrabass')).toBeGreaterThanOrEqual(1);
		expect(sections(CHAMBER, { counts: { 'Geige:1': 9 } }).find((section) => section.id === 'Geige:1')!.players).toBe(9);
	});

	it('seats the families where an orchestra does: strings in front, violins left, cellos right, winds behind, brass and percussion at the back', () => {
		const result = plan(SYMPHONY);
		const at = (section: string) => {
			const own = result.seats.filter((seat) => seat.section === section);
			return { x: own.reduce((sum, s) => sum + s.x, 0) / own.length, reach: Math.min(...own.map(reach)) };
		};
		expect(at('Geige:1').x).toBeLessThan(at('Viola').x);
		expect(at('Geige:2').x).toBeLessThan(at('Violoncello').x);
		expect(at('Violoncello').x).toBeGreaterThan(0);
		expect(at('Kontrabass').x).toBeGreaterThan(at('Violoncello').x);
		expect(at('Flöte').reach).toBeGreaterThan(at('Viola').reach);
		expect(at('Klarinette').reach).toBeGreaterThan(at('Flöte').reach);
		expect(at('Trompete').reach).toBeGreaterThan(at('Klarinette').reach);
		expect(at('Schlagwerk').reach).toBeGreaterThan(at('Trompete').reach - 0.01);
		expect(at('Flöte').x).toBeLessThan(at('Oboe').x);
		expect(at('Klarinette').x).toBeLessThan(at('Fagott').x);
		expect(at('Harfe').x).toBeLessThan(0);
	});

	it('keeps a section together', () => {
		const result = plan(SYMPHONY);
		for (const section of new Set(result.seats.map((seat) => seat.section))) {
			const own = result.seats.filter((seat) => seat.section === section);
			// Each chair has a neighbour of its own section within reach (a row behind at most).
			if (own.length > 1) for (const a of own) expect(Math.min(...own.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y))), section).toBeLessThan(2.2);
		}
	});

	it('leaves no gap for a family that isn’t there: without woodwinds the brass sits right behind the strings', () => {
		const result = plan(['Horn 1 & 2', 'Trompete 1 & 2', 'Geige 1 & 2', 'Viola', 'Violoncello']);
		const strings = Math.max(...result.seats.filter((seat) => seat.family === 'streicher').map(reach));
		const brass = Math.min(...result.seats.filter((seat) => seat.family === 'blech').map(reach));
		// One row's distance, as between any two rows behind the strings.
		expect(brass - strings).toBeLessThan(1.9);
	});

	it('seats a soloist from the Besetzung out front, ringed when the solo part is missing', () => {
		const solo: BesetzungVoice = { instrument: 'Klavier', numbers: [], solo: true };
		const found = sectionsFromBesetzung({
			voices: [...CHAMBER.map(voice), solo],
			missing: [solo],
			familyOf: (name) => families.get(name),
			abbr: (name) => name.slice(0, 3),
			title: (v) => v.instrument,
			soloLabel: 'Solo'
		});
		expect(found.filter((section) => section.instrument === 'Klavier')).toEqual([]);
		expect(found.find((section) => section.id === 'solo:Klavier')).toMatchObject({ players: 1, warn: true });
	});

	it('puts soloists beside the conductor and takes a concert’s own spot for a section', () => {
		const solo = plan(CHAMBER, { soloists: ['Geige'] });
		const soloist = solo.seats.find((seat) => seat.solo)!;
		expect(reach(soloist)).toBeLessThan(Math.min(...solo.seats.filter((seat) => !seat.solo).map(reach)));
		// German seating: second violins on the right, basses on the left.
		const german = layoutSeating(sections(CHAMBER), {
			overrides: { 'Geige:2': { order: 4 }, Kontrabass: { zone: 'left' } }
		});
		const x = (section: string) => german.seats.find((seat) => seat.section === section)!.x;
		expect(x('Geige:2')).toBeGreaterThan(x('Violoncello'));
		expect(x('Kontrabass')).toBeLessThan(0);
	});

	it('rings the sections without a part', () => {
		const result = plan(CHAMBER, { missing: ['Oboe 2'] });
		expect(result.seats.filter((seat) => seat.warn).every((seat) => seat.section === 'Oboe')).toBe(true);
		expect(result.labels.find((label) => label.section === 'Oboe')!.warn).toBe(true);
	});

	it('rings only the chair whose numbered part is missing', () => {
		const result = plan(CLASSICAL, { missing: ['Klarinette 2'] });
		const clarinets = result.seats.filter((seat) => seat.section === 'Klarinette');
		expect(clarinets.map((seat) => seat.warn).sort()).toEqual([false, true]);
		expect(clarinets.find((seat) => seat.warn)!.title).toBe('Klarinette 2');
		expect(result.seats.filter((seat) => seat.warn)).toHaveLength(1);
		expect(result.labels.find((label) => label.section === 'Klarinette')!.warn).toBe(true);
		// The whole instrument missing still rings every chair.
		const all = plan(CLASSICAL, { missing: ['Klarinette'] });
		expect(all.seats.filter((seat) => seat.section === 'Klarinette').every((seat) => seat.warn)).toBe(true);
	});

	it('seats the strings by stands of two: one stand in each of the first two rows, two from the third on', () => {
		expect(standRows(12)).toEqual([2, 2, 4, 4]);
		expect(standRows(7)).toEqual([2, 2, 3]);
		expect(standRows(1)).toEqual([1]);
		const result = layoutSeating(sections(CHAMBER, { counts: { 'Geige:1': 10 } }));
		const rows = new Map<string, number>();
		for (const seat of result.seats.filter((each) => each.section === 'Geige:1')) {
			const key = reach(seat).toFixed(1);
			rows.set(key, (rows.get(key) ?? 0) + 1);
		}
		expect([...rows].sort(([a], [b]) => Number(a) - Number(b)).map(([, n]) => n)).toEqual([2, 2, 4, 2]);
	});
});
