import { describe, expect, it } from 'vitest';
import { instrumentFromForm, instrumentName, instrumentState, loanFromForm, loanUrgency, openLoanOf, returnFromForm, sortInstrumentLoans, sortInstruments, urgentInstrumentLoans } from './lending.ts';

const form = (values: Record<string, string>) => {
	const data = new FormData();
	for (const [key, value] of Object.entries(values)) data.set(key, value);
	return data;
};

const people = [
	{ email: 'mia@example.org', name: 'Mia Beispiel' },
	{ email: 'paul@example.org', name: 'Paul Probe' }
];

describe('the instrument form', () => {
	it('keeps what was filled in, trimmed, and leaves out what was left empty', () => {
		expect(instrumentFromForm(form({ kind: ' Violine ', size: '3/4', maker: '', serial: 'BK-V-07', status: 'available' }))).toEqual({
			values: { kind: 'Violine', size: '3/4', serial: 'BK-V-07', status: 'available' }
		});
	});

	it('needs to know what it is, and a known state', () => {
		expect(instrumentFromForm(form({ kind: '  ' }))).toEqual({ problem: 'kind-missing' });
		expect(instrumentFromForm(form({ kind: 'Viola', status: 'on-loan' }))).toEqual({ problem: 'bad-status' });
		expect(instrumentFromForm(form({ kind: 'Viola' }))).toEqual({ values: { kind: 'Viola', status: 'available' } });
	});
});

describe('lending one out', () => {
	it('goes to a member by address, from today unless another day is given', () => {
		expect(loanFromForm(form({ email: 'MIA@example.org', due: '15.07.2027', handover: 'Neue Saiten' }), people, '2026-11-21')).toEqual({
			values: { email: 'mia@example.org', name: 'Mia Beispiel', from: '2026-11-21', due: '2027-07-15', handover: 'Neue Saiten' }
		});
		expect(loanFromForm(form({ email: 'paul@example.org', from: '2026-09-01' }), people, '2026-11-21')).toEqual({
			values: { email: 'paul@example.org', name: 'Paul Probe', from: '2026-09-01' }
		});
	});

	it('refuses someone who is not a member, unreadable dates and a return before the handover', () => {
		expect(loanFromForm(form({ email: 'fremd@example.org' }), people, '2026-11-21')).toEqual({ problem: 'who-missing' });
		expect(loanFromForm(form({ email: 'mia@example.org', due: 'bald' }), people, '2026-11-21')).toEqual({ problem: 'bad-date' });
		expect(loanFromForm(form({ email: 'mia@example.org', from: '2026-11-21', due: '2026-11-01' }), people, '2026-11-21')).toEqual({ problem: 'due-before-from' });
	});

	it('comes back today unless another day is given, never before it went out', () => {
		expect(returnFromForm(form({ returnNote: ' Riss im Koffer ' }), { from: '2026-09-01' }, '2026-11-21')).toEqual({ values: { returned: '2026-11-21', returnNote: 'Riss im Koffer' } });
		expect(returnFromForm(form({ returned: '2026-08-01' }), { from: '2026-09-01' }, '2026-11-21')).toEqual({ problem: 'before-from' });
	});
});

describe('the state of an instrument and its loans', () => {
	const loans = [
		{ id: 'a', instrumentId: 'v1', returned: '2026-06-30', due: '2026-07-01', from: '2025-09-01' },
		{ id: 'b', instrumentId: 'v1', due: '2026-11-25', from: '2026-09-01' },
		{ id: 'c', instrumentId: 'c1', due: '2026-11-10', from: '2026-01-10' },
		{ id: 'd', instrumentId: 'k1', from: '2026-10-01' }
	];

	it('is on loan while a loan is open, else what was set', () => {
		expect(openLoanOf(loans, 'v1')?.id).toBe('b');
		expect(instrumentState({ status: 'available' }, openLoanOf(loans, 'v1'))).toBe('on-loan');
		expect(instrumentState({ status: 'repair' }, openLoanOf(loans, 'x'))).toBe('repair');
	});

	it('counts as due like rented music: overdue, within two weeks, or open', () => {
		expect(loans.map((loan) => loanUrgency(loan, '2026-11-21'))).toEqual(['returned', 'due-soon', 'overdue', 'open']);
		expect(urgentInstrumentLoans(loans, '2026-11-21').map((loan) => loan.id)).toEqual(['b', 'c']);
	});

	it('lists open loans first, the most urgent on top, and returned ones after', () => {
		expect(sortInstrumentLoans(loans).map((loan) => loan.id)).toEqual(['c', 'b', 'd', 'a']);
	});

	it('names and sorts instruments by kind, size and number', () => {
		expect(instrumentName({ kind: 'Violine', size: '1/2' })).toBe('Violine 1/2');
		const sorted = sortInstruments([
			{ kind: 'Violine', size: '3/4', serial: '2' },
			{ kind: 'Viola', serial: '1' },
			{ kind: 'Violine', size: '1/2' },
			{ kind: 'Violine', size: '3/4', serial: '10' }
		]);
		expect(sorted.map((i) => `${i.kind} ${i.size ?? ''} ${i.serial ?? ''}`.trim())).toEqual(['Viola  1', 'Violine 1/2', 'Violine 3/4 2', 'Violine 3/4 10']);
	});
});
