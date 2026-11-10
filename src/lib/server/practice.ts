import { error } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import type { Stroke } from '#lib/practice/marks.ts';
import { matchParts, parseInstruments, playedParts } from '#lib/music/my-parts.ts';
import type { Part, PieceDetail } from '#lib/music/types.ts';
import type { Catalog } from '#lib/music/catalog.ts';
import type { OrchestraConfig } from '#lib/config/index.ts';
import { DAY_CAP_SECONDS } from '#lib/practice/practice.ts';
import { getCatalog } from './catalog.ts';
import { getStore } from './db/index.ts';
import { today } from './members.ts';
import { getAccessList, getMusicConfig } from './repertoire.ts';

const PDF = 'application/pdf';

/** Any PDF part of the archive, with its piece: what the viewer opens besides the member's own parts. */
export function archivePart(catalog: Catalog, fileId: string): { piece: PieceDetail; part: Part } | null {
	for (const piece of catalog.pieces) {
		const part = piece.parts.find((p) => p.id === fileId && p.mimeType === PDF);
		if (part) return { piece, part };
	}
	return null;
}

/**
 * A PDF of the member's own instrument, as "Meine Noten" lists it (their own parts and the
 * shared ones they may play from), with its piece; null for any other file. Only these count as
 * practice time.
 */
export function ownPart(catalog: Catalog, instrument: string, music: OrchestraConfig, fileId: string): { piece: PieceDetail; part: Part } | null {
	const choices = parseInstruments(instrument, music);
	if (!choices.length) return null;
	for (const piece of catalog.pieces) {
		const parts = playedParts(piece);
		const part = parts.find((p) => p.id === fileId && p.mimeType === PDF);
		if (!part) continue;
		const mine = choices.some((choice) => {
			const match = matchParts(parts, choice, music);
			return match.own.includes(part) || match.shared.includes(part);
		});
		return mine ? { piece, part } : null;
	}
	return null;
}

/** Adds one report from the practice viewer to the member's day, if they turned practice time on. */
export async function recordPractice(email: string, seconds: number): Promise<boolean> {
	const store = getStore();
	const member = normalizeEmail(email);
	if (seconds <= 0 || !(await store.practiceOn(member))) return false;
	await store.addPractice(member, today(), seconds, DAY_CAP_SECONDS);
	return true;
}

/**
 * Whether a member plays `file`: the signed-in member's own part, as for the viewer; for the
 * notes they offer their section and the offers they answer. A 404 for any other file.
 */
export async function requireOwnPart(email: string, file: string): Promise<void> {
	const [catalog, access, music] = await Promise.all([getCatalog(), getAccessList(), getMusicConfig()]);
	if (!catalog.ok) error(503, t.messages.archiveUnavailable);
	const member = access?.membersByEmail.get(email);
	if (!member || !ownPart(catalog.catalog, member.instrument ?? '', music, file)) error(404, t.messages.noFile);
}

/**
 * The offers of others in the member's section in a part, with who made them: only from those
 * who still play it, so an offer ends with its member leaving the section or the orchestra.
 */
export async function offersFor(email: string, file: string): Promise<{ id: string; from: string; pages: Record<number, Stroke[]> }[]> {
	const [shares, catalog, access, music] = await Promise.all([getStore().sharesFor(email, file), getCatalog(), getAccessList(), getMusicConfig()]);
	if (!shares.length || !catalog.ok) return [];
	return shares.flatMap((share) => {
		const sender = access?.membersByEmail.get(share.sender);
		if (!sender || !ownPart(catalog.catalog, sender.instrument ?? '', music, file)) return [];
		return [{ id: share.id, from: sender.name || t.practice.share.someone, pages: share.pages }];
	});
}
