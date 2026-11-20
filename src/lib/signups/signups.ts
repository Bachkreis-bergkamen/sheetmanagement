import { countingMembers, isAdminOnly, normalizeEmail, type Member } from '#lib/access/access.ts';
import type { OrchestraConfig } from '#lib/config/index.ts';
import * as t from '#lib/i18n/texts.ts';
import { formatInstrument, parseInstruments, type InstrumentChoice } from '#lib/music/my-parts.ts';
import { instrumentLabel } from '#lib/music/instrument-label.ts';
import { LAYOUT, normalize, readTable, type ColumnKey, type Table } from '#lib/repertoire/sheet.ts';

/**
 * Sign-ups for rehearsals and concerts ("Anmeldungen", #94): one row per person and
 * calendar event with Zusage · Vielleicht · Absage, the instrument they bring and a
 * comment. The tab is optional; without it the event pages say it isn't set up yet.
 */

export const ANSWERS = ['yes', 'maybe', 'no'] as const;
export type Answer = (typeof ANSWERS)[number];

export interface Signup {
	row: number;
	eventId: string;
	email: string;
	name: string;
	answer: Answer;
	/** As written, e.g. "Geige II"; empty: the member's own instrument. */
	instrument: string;
	comment: string;
	answeredAt: string;
}

export interface Signups {
	/** Per event id, one sign-up per email (the last row wins). */
	byEvent: Map<string, Signup[]>;
	table: Table<ColumnKey<'signups'> & string>;
}

/** A dropdown cell ("Zusage", "ja", "Absage") as its key; unknown text is no answer. */
export function readAnswer(text: string): Answer | null {
	const value = normalize(text);
	if (!value) return null;
	const labels = t.signups.answerValues;
	const found = ANSWERS.find((answer) => normalize(labels[answer]) === value || answer === value);
	if (found) return found;
	if (/^(ja|zu|komm)/.test(value)) return 'yes';
	if (/^(nein|ab|nicht)/.test(value)) return 'no';
	if (/^(vielleicht|evtl|unsicher)/.test(value)) return 'maybe';
	return null;
}

export function buildSignups(values: string[][]): Signups {
	const table = readTable(values, LAYOUT.signups.columns);
	const byEvent = new Map<string, Map<string, Signup>>();
	for (const { row, values: v } of table.rows) {
		const answer = readAnswer(v.answer);
		const email = normalizeEmail(v.who);
		if (!v.eventId || !email || !answer) continue;
		const event = byEvent.get(v.eventId) ?? new Map<string, Signup>();
		event.set(email, {
			row,
			eventId: v.eventId,
			email,
			name: v.name || email,
			answer,
			instrument: v.instrument,
			comment: v.comment,
			answeredAt: v.answeredAt
		});
		byEvent.set(v.eventId, event);
	}
	return { byEvent: new Map([...byEvent].map(([id, people]) => [id, [...people.values()]])), table };
}

/**
 * What someone plays at one event: the instrument given with the answer, else their first
 * instrument from "Mitglieder". With several part numbers ("Geige I & II") only the first counts.
 */
export function sectionOf(
	instrument: string,
	member: Pick<Member, 'instrument'> | undefined,
	config: OrchestraConfig
): InstrumentChoice | null {
	const choice = parseInstruments(instrument, config)[0] ?? parseInstruments(member?.instrument ?? '', config)[0];
	return choice ? { instrument: choice.instrument, numbers: choice.numbers.slice(0, 1) } : null;
}

export interface SectionCoverage {
	/** "Geige I", "Viola" */
	label: string;
	instrument: string;
	yes: string[];
	maybe: string[];
	no: string[];
	/** Expected members (active, in the event's orchestra) who haven't answered. */
	open: string[];
}

/**
 * Coverage per section for one event: who comes, maybe comes, can't, and hasn't answered,
 * in the configured instrument order. Members are expected when active, in the event's
 * orchestra and with an instrument; answers from anyone else count too.
 */
export function coverage(
	signups: Signup[],
	members: Member[],
	config: OrchestraConfig,
	{ orchestra, today }: { orchestra?: string; today: string }
): SectionCoverage[] {
	const sections = new Map<string, SectionCoverage>();
	const add = (choice: InstrumentChoice | null, name: string, kind: 'yes' | 'maybe' | 'no' | 'open') => {
		const label = choice ? formatInstrument(choice) : t.signups.noInstrument;
		let section = sections.get(label);
		if (!section) sections.set(label, (section = { label, instrument: choice?.instrument ?? '', yes: [], maybe: [], no: [], open: [] }));
		section[kind].push(name);
	};
	const byEmail = new Map(members.map((member) => [member.email, member]));
	const answered = new Set<string>();
	for (const signup of signups) {
		answered.add(signup.email);
		const member = byEmail.get(signup.email);
		// The shared admin account doesn't play, even if it clicked an answer.
		if (isAdminOnly(member)) continue;
		add(sectionOf(signup.instrument, member, config), member?.name ?? signup.name, signup.answer);
	}
	// The conductor or the board without an instrument only show up once they answer.
	for (const member of countingMembers(members, orchestra, today)) {
		if (!answered.has(member.email) && member.instrument) add(sectionOf('', member, config), member.name, 'open');
	}
	const order = new Map(config.instruments.map((instrument, i) => [instrument.name, i]));
	const rank = (section: SectionCoverage) => order.get(section.instrument) ?? Infinity;
	return [...sections.values()].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, config.locale));
}

/**
 * The same coverage with each instrument's parts as one line ("Cello" for "Cello I" and
 * "Cello II"), except the instruments that keep them apart (config.splitSections, the violins).
 */
export function groupSections(sections: SectionCoverage[], split: string[] = []): SectionCoverage[] {
	const keep = new Set(split.map(normalize));
	const grouped = new Map<string, SectionCoverage>();
	for (const section of sections) {
		const apart = !section.instrument || keep.has(normalize(section.instrument));
		const key = apart ? `label:${section.label}` : `instrument:${section.instrument}`;
		const found = grouped.get(key);
		if (!found) {
			grouped.set(key, { ...section, label: apart ? section.label : instrumentLabel(section.instrument), yes: [...section.yes], maybe: [...section.maybe], no: [...section.no], open: [...section.open] });
			continue;
		}
		for (const kind of ['yes', 'maybe', 'no', 'open'] as const) found[kind].push(...section[kind]);
	}
	return [...grouped.values()];
}

/** Totals over all sections. */
export function totals(sections: SectionCoverage[]) {
	const sum = (kind: 'yes' | 'maybe' | 'no' | 'open') => sections.reduce((n, section) => n + section[kind].length, 0);
	return { yes: sum('yes'), maybe: sum('maybe'), no: sum('no'), open: sum('open') };
}
