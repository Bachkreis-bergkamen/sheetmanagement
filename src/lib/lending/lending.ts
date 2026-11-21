import { parseDay } from '#lib/access/access.ts';
import { daysUntilDue, loanState, type LoanState } from '#lib/loans/loans.ts';

/**
 * Instruments the orchestra lends to its members (#296): what there is, who has which one
 * since when, and in what state it went out and came back. Kept in D1, not in the sheet:
 * who has which instrument is personal. Sheet music on loan is something else (#119,
 * src/lib/loans/loans.ts); the due dates work the same way.
 */

/** What an instrument is when nobody has it; "on loan" comes from its open loan. */
export const INSTRUMENT_STATUSES = ['available', 'repair', 'retired'] as const;
export type InstrumentStatus = (typeof INSTRUMENT_STATUSES)[number];
export type InstrumentState = InstrumentStatus | 'on-loan';

export interface LendInstrument {
	id: string;
	/** "Violine", "Klarinette in B". */
	kind: string;
	/** Maker and model: "Yamaha YCL-255". */
	maker?: string;
	serial?: string;
	/** "1/2", "3/4", for strings mostly. */
	size?: string;
	/** Case, bow, mouthpiece, reeds … */
	accessories?: string;
	/** What it's worth and how it's insured, as written. */
	value?: string;
	notes?: string;
	status: InstrumentStatus;
	createdAt: string;
}

export type NewLendInstrument = Omit<LendInstrument, 'id' | 'createdAt'>;

export interface InstrumentLoan {
	id: string;
	instrumentId: string;
	/** The member who has it, by their address as the access list has it. */
	email: string;
	name: string;
	/** "2026-09-01": handed over. */
	from: string;
	/** "2027-07-15": to be back by, if agreed. */
	due?: string;
	/** Its state on handover: "Kratzer am Boden, neue Saiten". */
	handover?: string;
	/** "2027-07-10": back. Open loans have none. */
	returned?: string;
	/** Its state on return, damage included. */
	returnNote?: string;
	/** Who entered the loan. */
	by: string;
	createdAt: string;
}

export type NewInstrumentLoan = Pick<InstrumentLoan, 'instrumentId' | 'email' | 'name' | 'from' | 'due' | 'handover' | 'by'>;

const LIMITS = { kind: 100, maker: 200, serial: 100, size: 40, accessories: 500, value: 200, notes: 1000, handover: 1000, returnNote: 1000 } as const;

const text = (data: FormData, key: keyof typeof LIMITS) => String(data.get(key) ?? '').trim().slice(0, LIMITS[key]) || undefined;

export type InstrumentProblem = 'kind-missing' | 'bad-status';

/** The instrument form; an instrument on loan keeps its status until it's back. */
export function instrumentFromForm(data: FormData): { values: NewLendInstrument } | { problem: InstrumentProblem } {
	const kind = text(data, 'kind');
	if (!kind) return { problem: 'kind-missing' };
	const status = String(data.get('status') ?? 'available');
	if (!(INSTRUMENT_STATUSES as readonly string[]).includes(status)) return { problem: 'bad-status' };
	const values: NewLendInstrument = { kind, status: status as InstrumentStatus };
	for (const key of ['maker', 'serial', 'size', 'accessories', 'value', 'notes'] as const) {
		const value = text(data, key);
		if (value) values[key] = value;
	}
	return { values };
}

export type LoanProblem = 'who-missing' | 'bad-date' | 'due-before-from' | 'not-available';

/** The lending form: to whom (one of `people`, by address), from when, until when. */
export function loanFromForm(
	data: FormData,
	people: { email: string; name: string }[],
	today: string
): { values: Omit<NewInstrumentLoan, 'instrumentId' | 'by'> } | { problem: LoanProblem } {
	const who = String(data.get('email') ?? '').trim().toLowerCase();
	const person = people.find((p) => p.email === who);
	if (!person) return { problem: 'who-missing' };
	const fromText = String(data.get('from') ?? '').trim();
	const dueText = String(data.get('due') ?? '').trim();
	const from = fromText ? parseDay(fromText) : today;
	const due = dueText ? parseDay(dueText) : undefined;
	if (!from || (dueText && !due)) return { problem: 'bad-date' };
	if (due && due < from) return { problem: 'due-before-from' };
	return { values: { email: person.email, name: person.name, from, ...(due ? { due } : {}), ...(text(data, 'handover') ? { handover: text(data, 'handover') } : {}) } };
}

export type ReturnProblem = 'bad-date' | 'before-from';

/** The return form: when it came back (today unless given) and in what state. */
export function returnFromForm(data: FormData, loan: Pick<InstrumentLoan, 'from'>, today: string): { values: { returned: string; returnNote?: string } } | { problem: ReturnProblem } {
	const dayText = String(data.get('returned') ?? '').trim();
	const returned = dayText ? parseDay(dayText) : today;
	if (!returned) return { problem: 'bad-date' };
	if (returned < loan.from) return { problem: 'before-from' };
	const returnNote = text(data, 'returnNote');
	return { values: { returned, ...(returnNote ? { returnNote } : {}) } };
}

/** The loan an instrument is out on, if it is. */
export const openLoanOf = <L extends Pick<InstrumentLoan, 'instrumentId' | 'returned'>>(loans: L[], instrumentId: string) =>
	loans.find((loan) => loan.instrumentId === instrumentId && !loan.returned);

export function instrumentState(instrument: Pick<LendInstrument, 'status'>, openLoan: unknown): InstrumentState {
	return openLoan ? 'on-loan' : instrument.status;
}

/** How urgent an open loan is, as for sheet music: overdue, due within two weeks, or open. */
export const loanUrgency = (loan: Pick<InstrumentLoan, 'returned' | 'due'>, today: string): LoanState => loanState({ returned: !!loan.returned, dueAt: loan.due }, today);

export const loanDays = (loan: Pick<InstrumentLoan, 'due'>, today: string) => daysUntilDue({ dueAt: loan.due }, today);

/** Open loans that need a look: overdue or due soon. */
export const urgentInstrumentLoans = <L extends Pick<InstrumentLoan, 'returned' | 'due'>>(loans: L[], today: string) =>
	loans.filter((loan) => ['overdue', 'due-soon'].includes(loanUrgency(loan, today)));

/** "Violine 1/2", the instrument's name in lists; the maker and number come after it. */
export const instrumentName = (instrument: Pick<LendInstrument, 'kind' | 'size'>) => [instrument.kind, instrument.size].filter(Boolean).join(' ');

/** "Yamaha YVN · Nr. 1234"-style details, without the label for the number. */
export const instrumentDetails = (instrument: Pick<LendInstrument, 'maker' | 'serial'>) => [instrument.maker, instrument.serial].filter(Boolean) as string[];

/** By kind, then size and number, so the same instruments stand together. */
export function sortInstruments<I extends Pick<LendInstrument, 'kind' | 'size' | 'serial'>>(instruments: I[]): I[] {
	const key = (i: I) => [i.kind, i.size ?? '', i.serial ?? ''];
	return [...instruments].sort((a, b) => {
		const [x, y] = [key(a), key(b)];
		for (let n = 0; n < x.length; n++) {
			const order = x[n].localeCompare(y[n], undefined, { numeric: true, sensitivity: 'base' });
			if (order) return order;
		}
		return 0;
	});
}

/** Open loans first, the most urgent on top; returned ones after, the latest return first. */
export function sortInstrumentLoans<L extends Pick<InstrumentLoan, 'returned' | 'due' | 'from'>>(loans: L[]): L[] {
	return [...loans].sort((a, b) => {
		if (!!a.returned !== !!b.returned) return a.returned ? 1 : -1;
		if (a.returned && b.returned) return b.returned.localeCompare(a.returned) || b.from.localeCompare(a.from);
		return (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.from.localeCompare(b.from);
	});
}
