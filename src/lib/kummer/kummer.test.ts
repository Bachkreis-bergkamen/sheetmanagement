import { describe, expect, it } from 'vitest';
import { authorDay, isFor, kummerFromForm, replyFromForm, unreadForAuthor, unreadForLeitung } from './kummer.ts';

const form = (fields: Record<string, string | string[]>) => {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) for (const one of [value].flat()) data.append(name, one);
	return data;
};
const leitung = ['david@example.org', 'tim@example.org'];

describe('kummerFromForm', () => {
	it('is anonymous unless the writer ticks to give their name', () => {
		expect(kummerFromForm(form({ subject: ' Zu  laut ', body: 'Text' }), { leitung, name: 'Mia Beispiel' })).toEqual({
			kummer: { subject: 'Zu laut', body: 'Text', recipients: [] }
		});
		expect(kummerFromForm(form({ subject: 'Zu laut', body: 'Text', signed: 'on' }), { leitung, name: 'Mia Beispiel' })).toMatchObject({
			kummer: { authorName: 'Mia Beispiel' }
		});
	});

	it('goes to the people picked, or to all of them', () => {
		expect(kummerFromForm(form({ subject: 'S', body: 'B', to: 'David@Example.org' }), { leitung, name: '' })).toMatchObject({ kummer: { recipients: ['david@example.org'] } });
		// Everyone ticked is the whole Leitung, so someone who joins later reads it too.
		expect(kummerFromForm(form({ subject: 'S', body: 'B', to: leitung }), { leitung, name: '' })).toMatchObject({ kummer: { recipients: [] } });
		expect(kummerFromForm(form({ subject: 'S', body: 'B', to: 'mia@example.org' }), { leitung, name: '' })).toEqual({ problem: 'recipient' });
	});

	it('wants a subject and a message of a sensible length', () => {
		expect(kummerFromForm(form({ subject: '', body: 'B' }), { leitung, name: '' })).toEqual({ problem: 'subject' });
		expect(kummerFromForm(form({ subject: 'S', body: '  ' }), { leitung, name: '' })).toEqual({ problem: 'body' });
		expect(kummerFromForm(form({ subject: 'S', body: 'x'.repeat(5001) }), { leitung, name: '' })).toEqual({ problem: 'too-long' });
		expect(replyFromForm(form({ body: ' Danke ' }))).toEqual({ body: 'Danke' });
	});
});

describe('reading', () => {
	it('lets the Leitung read what is for all of them or for them', () => {
		expect(isFor({ recipients: [] }, 'tim@example.org')).toBe(true);
		expect(isFor({ recipients: ['david@example.org'] }, 'David@example.org')).toBe(true);
		expect(isFor({ recipients: ['david@example.org'] }, 'tim@example.org')).toBe(false);
	});

	it('marks what came from the other side since the last look', () => {
		expect(unreadForAuthor({}, undefined)).toBe(false);
		expect(unreadForAuthor({ lastLeitungAt: '2026-11-02' }, '2026-11-01')).toBe(true);
		expect(unreadForLeitung({ lastAuthorAt: '2026-11-02' }, undefined)).toBe(true);
		expect(unreadForLeitung({ lastAuthorAt: '2026-11-02' }, '2026-11-03')).toBe(false);
	});

	it('shows the Leitung only the day a writer wrote', () => {
		expect(authorDay('2026-11-01T20:15:33.000Z')).toBe('2026-11-01');
	});
});
