import type { InstrumentLoan, LendInstrument, NewInstrumentLoan, NewLendInstrument } from '#lib/lending/lending.ts';
import type { D1 } from './db/sql.ts';

/**
 * Where the instruments the orchestra lends out are kept (#296): in D1 with plain SQL on a
 * deployment, in memory for the demo and tests; both behave the same, and the tests run the
 * SQL against SQLite.
 */
export interface LendingStore {
	/** Every instrument, retired ones too. */
	instruments(): Promise<LendInstrument[]>;
	instrument(id: string): Promise<LendInstrument | null>;
	addInstrument(instrument: NewLendInstrument, now?: string): Promise<LendInstrument>;
	updateInstrument(id: string, instrument: NewLendInstrument): Promise<void>;
	/** Only one that was never lent out; the others are retired, so their history stays. */
	removeInstrument(id: string): Promise<boolean>;

	/** Every loan, the latest handover first. */
	loans(): Promise<InstrumentLoan[]>;
	/** One person's loans, the latest handover first. */
	loansOf(email: string): Promise<InstrumentLoan[]>;
	/** Lends it out, unless it's already out or not available; null then. */
	lend(loan: NewInstrumentLoan, now?: string): Promise<InstrumentLoan | null>;
	/** Marks an open loan returned; false when it was returned already. */
	giveBack(loanId: string, returned: string, returnNote?: string): Promise<boolean>;

	/** How many loans carry this address; for "Mitglied löschen" (#158). */
	countBy(email: string): Promise<number>;
	/** The loans stay, as the instrument's history, under a pseudonym. */
	forget(email: string, stand: { email: string; name: string }): Promise<void>;
}

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS lending_instruments (
		id TEXT PRIMARY KEY,
		kind TEXT NOT NULL,
		status TEXT NOT NULL,
		data TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS lending_loans (
		id TEXT PRIMARY KEY,
		instrument_id TEXT NOT NULL,
		email TEXT NOT NULL,
		name TEXT NOT NULL,
		from_day TEXT NOT NULL,
		due_day TEXT,
		returned_day TEXT,
		data TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS lending_loans_instrument ON lending_loans (instrument_id)`,
	`CREATE INDEX IF NOT EXISTS lending_loans_email ON lending_loans (email)`
];

interface InstrumentRow {
	id: string;
	kind: string;
	status: string;
	data: string;
	created_at: string;
}

interface LoanRow {
	id: string;
	instrument_id: string;
	email: string;
	name: string;
	from_day: string;
	due_day: string | null;
	returned_day: string | null;
	data: string;
	created_at: string;
}

/** What isn't a column of its own goes into `data`. */
type InstrumentData = Omit<NewLendInstrument, 'kind' | 'status'>;
type LoanData = Pick<InstrumentLoan, 'handover' | 'returnNote' | 'by'>;

const toInstrument = (row: InstrumentRow): LendInstrument => ({
	id: row.id,
	kind: row.kind,
	...(JSON.parse(row.data) as InstrumentData),
	status: row.status as LendInstrument['status'],
	createdAt: row.created_at
});

const toLoan = (row: LoanRow): InstrumentLoan => ({
	id: row.id,
	instrumentId: row.instrument_id,
	email: row.email,
	name: row.name,
	from: row.from_day,
	...(row.due_day ? { due: row.due_day } : {}),
	...(row.returned_day ? { returned: row.returned_day } : {}),
	...(JSON.parse(row.data) as LoanData),
	createdAt: row.created_at
});

const instrumentData = ({ kind: _, status: __, ...rest }: NewLendInstrument): InstrumentData => rest;
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const LATEST = 'ORDER BY from_day DESC, created_at DESC';

export class SqlLendingStore implements LendingStore {
	#ready: Promise<void> | null = null;

	constructor(private readonly db: D1) {}

	/** The tables are made on first use, so a new D1 database needs no setup step. */
	private ready(): Promise<void> {
		this.#ready ??= (async () => {
			for (const statement of SCHEMA) await this.db.prepare(statement).run();
		})().catch((cause) => {
			this.#ready = null;
			throw cause;
		});
		return this.#ready;
	}

	async instruments(): Promise<LendInstrument[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM lending_instruments ORDER BY kind, created_at').all<InstrumentRow>();
		return results.map(toInstrument);
	}

	async instrument(id: string): Promise<LendInstrument | null> {
		await this.ready();
		const row = await this.db.prepare('SELECT * FROM lending_instruments WHERE id = ?').bind(id).first<InstrumentRow>();
		return row ? toInstrument(row) : null;
	}

	async addInstrument(instrument: NewLendInstrument, now = new Date().toISOString()): Promise<LendInstrument> {
		await this.ready();
		const id = newId();
		await this.db
			.prepare('INSERT INTO lending_instruments (id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?)')
			.bind(id, instrument.kind, instrument.status, JSON.stringify(instrumentData(instrument)), now)
			.run();
		return { ...instrument, id, createdAt: now };
	}

	async updateInstrument(id: string, instrument: NewLendInstrument): Promise<void> {
		await this.ready();
		await this.db
			.prepare('UPDATE lending_instruments SET kind = ?, status = ?, data = ? WHERE id = ?')
			.bind(instrument.kind, instrument.status, JSON.stringify(instrumentData(instrument)), id)
			.run();
	}

	async removeInstrument(id: string): Promise<boolean> {
		await this.ready();
		await this.db.prepare('DELETE FROM lending_instruments WHERE id = ? AND NOT EXISTS (SELECT 1 FROM lending_loans WHERE instrument_id = ?)').bind(id, id).run();
		return !(await this.instrument(id));
	}

	async loans(): Promise<InstrumentLoan[]> {
		await this.ready();
		const { results } = await this.db.prepare(`SELECT * FROM lending_loans ${LATEST}`).all<LoanRow>();
		return results.map(toLoan);
	}

	async loansOf(email: string): Promise<InstrumentLoan[]> {
		await this.ready();
		const { results } = await this.db.prepare(`SELECT * FROM lending_loans WHERE email = ? ${LATEST}`).bind(email).all<LoanRow>();
		return results.map(toLoan);
	}

	async lend(loan: NewInstrumentLoan, now = new Date().toISOString()): Promise<InstrumentLoan | null> {
		await this.ready();
		const id = newId();
		const data: LoanData = { by: loan.by, ...(loan.handover ? { handover: loan.handover } : {}) };
		// One statement, so two people lending the same instrument at once can't both succeed.
		await this.db
			.prepare(
				`INSERT INTO lending_loans (id, instrument_id, email, name, from_day, due_day, data, created_at)
				SELECT ?, ?, ?, ?, ?, ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM lending_instruments WHERE id = ? AND status = 'available')
				AND NOT EXISTS (SELECT 1 FROM lending_loans WHERE instrument_id = ? AND returned_day IS NULL)`
			)
			.bind(id, loan.instrumentId, loan.email, loan.name, loan.from, loan.due ?? null, JSON.stringify(data), now, loan.instrumentId, loan.instrumentId)
			.run();
		const row = await this.db.prepare('SELECT * FROM lending_loans WHERE id = ?').bind(id).first<LoanRow>();
		return row ? toLoan(row) : null;
	}

	async giveBack(loanId: string, returned: string, returnNote?: string): Promise<boolean> {
		await this.ready();
		const row = await this.db.prepare('SELECT * FROM lending_loans WHERE id = ? AND returned_day IS NULL').bind(loanId).first<LoanRow>();
		if (!row) return false;
		const data: LoanData = { ...JSON.parse(row.data), ...(returnNote ? { returnNote } : {}) };
		await this.db.prepare('UPDATE lending_loans SET returned_day = ?, data = ? WHERE id = ? AND returned_day IS NULL').bind(returned, JSON.stringify(data), loanId).run();
		return true;
	}

	async countBy(email: string): Promise<number> {
		await this.ready();
		const row = await this.db.prepare('SELECT COUNT(*) AS n FROM lending_loans WHERE email = ?').bind(email).first<{ n: number }>();
		return row?.n ?? 0;
	}

	async forget(email: string, stand: { email: string; name: string }): Promise<void> {
		await this.ready();
		await this.db.prepare('UPDATE lending_loans SET email = ?, name = ? WHERE email = ?').bind(stand.email, stand.name, email).run();
	}
}

export class MemoryLendingStore implements LendingStore {
	private kept = new Map<string, LendInstrument>();
	private lent: InstrumentLoan[] = [];

	private latest(loans: InstrumentLoan[]) {
		return loans.map((loan) => structuredClone(loan)).sort((a, b) => b.from.localeCompare(a.from) || b.createdAt.localeCompare(a.createdAt));
	}

	async instruments() {
		return [...this.kept.values()].map((instrument) => structuredClone(instrument)).sort((a, b) => a.kind.localeCompare(b.kind) || a.createdAt.localeCompare(b.createdAt));
	}

	async instrument(id: string) {
		const instrument = this.kept.get(id);
		return instrument ? structuredClone(instrument) : null;
	}

	async addInstrument(instrument: NewLendInstrument, now = new Date().toISOString()) {
		const added = { ...structuredClone(instrument), id: newId(), createdAt: now };
		this.kept.set(added.id, added);
		return structuredClone(added);
	}

	async updateInstrument(id: string, instrument: NewLendInstrument) {
		const old = this.kept.get(id);
		if (old) this.kept.set(id, { ...structuredClone(instrument), id, createdAt: old.createdAt });
	}

	async removeInstrument(id: string) {
		if (this.lent.some((loan) => loan.instrumentId === id)) return !this.kept.has(id);
		this.kept.delete(id);
		return true;
	}

	async loans() {
		return this.latest(this.lent);
	}

	async loansOf(email: string) {
		return this.latest(this.lent.filter((loan) => loan.email === email));
	}

	async lend(loan: NewInstrumentLoan, now = new Date().toISOString()) {
		if (this.kept.get(loan.instrumentId)?.status !== 'available') return null;
		if (this.lent.some((other) => other.instrumentId === loan.instrumentId && !other.returned)) return null;
		const { handover, due, ...rest } = loan;
		const added: InstrumentLoan = { ...rest, ...(due ? { due } : {}), ...(handover ? { handover } : {}), id: newId(), createdAt: now };
		this.lent.push(added);
		return structuredClone(added);
	}

	async giveBack(loanId: string, returned: string, returnNote?: string) {
		const loan = this.lent.find((one) => one.id === loanId && !one.returned);
		if (!loan) return false;
		Object.assign(loan, { returned, ...(returnNote ? { returnNote } : {}) });
		return true;
	}

	async countBy(email: string) {
		return this.lent.filter((loan) => loan.email === email).length;
	}

	async forget(email: string, stand: { email: string; name: string }) {
		for (const loan of this.lent) if (loan.email === email) Object.assign(loan, stand);
	}
}
