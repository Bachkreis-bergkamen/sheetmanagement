import { MEMBER_STATUSES, parseDay, type MemberStatus } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { choicesFromForm, formatInstruments, playableInstruments } from '#lib/music/my-parts.ts';
import { eventDay } from '#lib/repertoire/dates.ts';
import type { ColumnKey, Table } from '#lib/repertoire/sheet.ts';

/**
 * The member fields both /admin and /profil edit: name, instruments, orchestras and status.
 * Groups and rights stay with /admin.
 */

/** Today in the orchestra's time zone, for the end of a pause. */
export const today = () => eventDay({ start: new Date().toISOString(), allDay: false }, config.timeZone);

type Columns = ColumnKey<'members'> & string;
export type MemberValues = Partial<Record<Columns, string>>;

const text = (data: FormData, name: string) => String(data.get(name) ?? '').trim().slice(0, 200);

/** The orchestras ticked, in the configured order; unknown names are dropped. */
const orchestras = (data: FormData) => {
	const picked = new Set(data.getAll('orchestra').map(String));
	return config.orchestras.filter((name) => picked.has(name));
};

/** Reads the form, or says what's wrong with it. */
export function readMemberForm(data: FormData): { values: MemberValues } | { problem: string } {
	const status = (text(data, 'status') || 'aktiv') as MemberStatus;
	if (!MEMBER_STATUSES.includes(status)) return { problem: t.profile.unknownStatus };
	const until = text(data, 'pausedUntil');
	const pausedUntil = status === 'pausiert' && until ? parseDay(until) : undefined;
	if (status === 'pausiert' && until && !pausedUntil) return { problem: t.profile.badDate };
	return {
		values: {
			name: text(data, 'name'),
			instrument: formatInstruments(choicesFromForm(data, playableInstruments(config))),
			orchestras: orchestras(data).join(', '),
			status,
			pausedUntil: pausedUntil ?? ''
		}
	};
}

/**
 * Leaves out new columns a sheet doesn't have yet while their value is the default, so
 * editing a name still works before /setup added "Orchester" or "Status".
 */
export function writable(table: Table<Columns>, values: MemberValues): MemberValues {
	const defaults: MemberValues = { orchestras: '', status: 'aktiv', pausedUntil: '', children: '' };
	return Object.fromEntries(
		Object.entries(values).filter(([key, value]) => table.indexes[key as Columns] !== undefined || value !== (defaults[key as Columns] ?? null))
	);
}
