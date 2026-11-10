import { error, json } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { feedbackUser, formText } from '#lib/server/feedback.ts';
import { reportFromForm } from '#lib/server/report-form.ts';
import type { RequestHandler } from './$types';

/**
 * A problem report (Meldung) from the practice viewer or "Meine Noten" (#306): the piece page's
 * form fields plus `pieceId`, answered as JSON: `{ reported: true }` or `{ reportError }`.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = feedbackUser(locals);
	if (!user) error(403, t.reports.signInNeeded);
	const data = await request.formData().catch(() => null);
	if (!data) error(400, t.reports.failed);
	const result = await reportFromForm(user, formText(data, 'pieceId'), data);
	return 'reportError' in result ? json({ reportError: result.reportError }, { status: result.status }) : json(result);
};
