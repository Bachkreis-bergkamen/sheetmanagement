import { fail } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { PRIORITIES, type Priority } from '#lib/repertoire/missing-parts.ts';
import { peopleWithRight } from '#lib/reminders/reminders.ts';
import { authConfig, requireRight } from './auth/index.ts';
import { runInBackground } from './env.ts';
import { notify, pushReady } from './push/index.ts';
import { getAccessList } from './repertoire.ts';
import { ensureColumns, refreshAfterWrite, SheetLayoutError, updateRecords } from './sheet-writes.ts';

/**
 * Scan jobs: the Notenwart gives gaps in "Fehlende Stimmen" a priority and someone to
 * scan them, one part or every gap of a piece at once. Whoever gets new parts hears of it on
 * their devices. Planned on /fehlende-stimmen and on the piece page.
 */

/** Who plans scans and who can be given one: whoever may edit pieces, as for ticking gaps off. */
export const SCAN_RIGHT = 'stuecke.bearbeiten';

export interface Scanner {
	email: string;
	name: string;
}

/** Everyone a scan can go to, by name. */
export async function scanners(): Promise<Scanner[]> {
	const auth = authConfig();
	const list = await getAccessList();
	return peopleWithRight(list, auth.mode === 'on' ? auth.bootstrapAdmins : [], SCAN_RIGHT)
		.map((email) => ({ email, name: list?.membersByEmail.get(email)?.name || email }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** The "scan" action of both pages: the gaps in `id` get the priority and the person (empty clears them). */
export async function planScans(locals: App.Locals, request: Request) {
	requireRight(locals, SCAN_RIGHT);
	const form = await request.formData();
	const ids = new Set(form.getAll('id').map((id) => String(id).slice(0, 100)).filter(Boolean));
	const priority = PRIORITIES.find((p) => p === form.get('priority'));
	const assignee = normalizeEmail(String(form.get('assignee') ?? '').slice(0, 200));
	if (assignee && !(await scanners()).some((person) => person.email === assignee)) return fail(400, { message: t.gaps.notScanner });

	const table = await ensureColumns('missingParts', ['priority', 'assignee']).catch((cause) =>
		cause instanceof SheetLayoutError ? null : Promise.reject(cause)
	);
	const rows = table?.rows.filter((row) => ids.has(row.values.fileId)) ?? [];
	if (!table || !rows.length) return fail(404, { message: t.gaps.planGone });
	await updateRecords(
		'missingParts',
		table,
		rows.map((row) => ({ row: row.row, values: { priority: priority ? t.sheetValues.priority[priority] : '', assignee } }))
	);
	await refreshAfterWrite();

	// Only parts that are new to them; nobody needs telling what they gave themselves.
	const fresh = rows.filter((row) => assignee && normalizeEmail(row.values.assignee) !== assignee);
	if (fresh.length && assignee !== normalizeEmail(locals.access.user?.email ?? '')) {
		announceScans(
			assignee,
			fresh.map((row) => ({ piece: row.values.piece, part: row.values.part })),
			priority
		);
	}
	return { scanSaved: true };
}

/** "Bitte scannen – Avengers: Trompete 1, Trompete 2" to the one who scans; sent after the response. */
function announceScans(email: string, parts: { piece: string; part: string }[], priority: Priority | undefined) {
	if (!pushReady()) return;
	const byPiece = new Map<string, string[]>();
	for (const { piece, part } of parts) byPiece.set(piece, [...(byPiece.get(piece) ?? []), part]);
	const body = [...byPiece].map(([piece, names]) => t.gaps.push.body(piece, names)).join(' · ');
	runInBackground(
		notify([email], {
			title: priority === 'high' ? t.gaps.push.titleHigh : t.gaps.push.title,
			body: body.slice(0, 200),
			url: '/fehlende-stimmen?meine',
			tag: 'scan'
		}).catch((error) => console.error('Announcing a scan job failed:', error))
	);
}
