import { describe, expect, it } from 'vitest';
import { answerOf, byAnswer, mayAnswer, parentsOf } from './photos.ts';

const members = [
	{ email: 'mum@x.org', children: ['mia@x.org'] },
	{ email: 'dad@x.org', children: ['mia@x.org', 'jonas@x.org'] },
	{ email: 'mia@x.org', children: [] },
	{ email: 'anna@x.org', children: [] }
];

describe('photo consent (#299)', () => {
	it('is given by the parents of a young player, by everyone else themself', () => {
		expect(parentsOf('Mia@x.org', members)).toEqual(['mum@x.org', 'dad@x.org']);
		expect(mayAnswer('mum@x.org', 'mia@x.org', members)).toBe(true);
		expect(mayAnswer('DAD@x.org', 'jonas@x.org', members)).toBe(true);
		// Not the child once a parent is linked, nor another parent's child.
		expect(mayAnswer('mia@x.org', 'mia@x.org', members)).toBe(false);
		expect(mayAnswer('mum@x.org', 'jonas@x.org', members)).toBe(false);
		expect(mayAnswer('anna@x.org', 'anna@x.org', members)).toBe(true);
		expect(mayAnswer('mum@x.org', 'anna@x.org', members)).toBe(false);
	});

	it('counts as no until someone answers, and lists the no first', () => {
		expect(answerOf(null)).toBe('open');
		expect(answerOf({ allowed: true })).toBe('yes');
		expect(answerOf({ allowed: false })).toBe('no');
		const players = [
			{ name: 'Ben', answer: 'yes' as const },
			{ name: 'Mia', answer: 'open' as const },
			{ name: 'Anna', answer: 'no' as const },
			{ name: 'Alex', answer: 'open' as const }
		];
		expect(byAnswer(players).map((player) => player.name)).toEqual(['Anna', 'Alex', 'Mia', 'Ben']);
	});
});
