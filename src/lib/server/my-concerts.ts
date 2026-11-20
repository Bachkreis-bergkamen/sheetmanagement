import { normalizeEmail, playsIn, type Member } from '#lib/access/access.ts';
import { config, type OrchestraConfig } from '#lib/config/index.ts';
import type { Glyph } from '#lib/music/instrument-glyph.ts';
import { partGlyph } from '#lib/music/instrument-glyph.ts';
import { matchParts, parseInstruments, playedParts, playingAt, type InstrumentChoice } from '#lib/music/my-parts.ts';
import { pickedAt, type PartAssignment } from '#lib/music/part-assignments.ts';
import type { Signups } from '#lib/signups/signups.ts';
import { isPastConcert, type Library, type LibraryConcert, type ProgramItem } from '#lib/server/library.ts';

const PDF = 'application/pdf';

/** What the member plays of a concert: with several orchestras, only their own orchestras' programmes. */
export function programFor(concert: LibraryConcert | undefined, member: Member | undefined): ProgramItem[] {
	const program = concert?.program ?? [];
	return member && (concert?.orchestras.length ?? 0) > 1 ? program.filter((item) => playsIn(member, item.orchestra)) : program;
}

/**
 * The concerts to show on "Meine Noten", one below the other: every upcoming one of the member's
 * orchestras, soonest first, and one asked for in the URL on top. `focus` is where the page
 * starts: the one asked for, else the next one with a programme.
 */
export function pickConcerts(concerts: LibraryConcert[], today: string, wanted: string | null, member: Member | undefined) {
	const upcoming = concerts
		.filter((concert) => !isPastConcert(concert, today) && (!member || playsIn(member, concert.orchestra)))
		.reverse();
	const asked = wanted ? concerts.find((c) => c.id === wanted) : undefined;
	const shown = asked && !upcoming.includes(asked) ? [asked, ...upcoming] : upcoming;
	const focus = asked ?? upcoming.find((c) => programFor(c, member).length) ?? upcoming[0];
	return { shown, focus };
}

/**
 * The part a member gave with their answer to a date ("Geige II"), from the first of these
 * dates that has one: a rehearsal's own answer, then its concert's. None: what they play anyway.
 */
export function saidAt(signups: Signups | null | undefined, email: string | undefined, eventIds: (string | undefined)[]): InstrumentChoice[] {
	if (!signups || !email) return [];
	const who = normalizeEmail(email);
	for (const id of eventIds) {
		const answer = id ? signups.byEvent.get(id)?.find((signup) => signup.email === who) : undefined;
		const said = answer ? parseInstruments(answer.instrument, config) : [];
		if (said.length) return said;
	}
	return [];
}

/** A part kept on the device ahead of time, with what "Meine Noten" shows of it offline. */
export interface UpcomingPart {
	id: string;
	label: string;
	piece: string;
	pieceId: string;
	glyph: Glyph;
}

/**
 * The member's PDF parts for their next `count` concerts with a programme, as "Meine Noten" lists
 * them: their own parts and the shared ones they may play from, or the part assigned to them (#262).
 * The service worker keeps these on the device, so the next rehearsals work without a connection.
 */
export function upcomingParts(
	library: Library,
	member: Member,
	music: OrchestraConfig,
	assignments: PartAssignment[],
	count = 2,
	signups?: Signups | null
): UpcomingPart[] {
	const own = parseInstruments(member.instrument ?? '', config);
	if (!own.length) return [];
	const concerts = pickConcerts(library.concerts, library.today, null, member)
		.shown.filter((concert) => programFor(concert, member).length)
		.slice(0, count);
	const found = new Map<string, UpcomingPart>();
	for (const concert of concerts) {
		// Only the part they play there, once they said which (Geige II of Geige I & II).
		const choices = playingAt(own, saidAt(signups, member.email, [concert.id]));
		for (const item of programFor(concert, member)) {
			const piece = item.pieceId ? library.piecesById.get(item.pieceId) : undefined;
			if (!piece?.detail) continue;
			const parts = playedParts(piece.detail, item.movements);
			const { choices: played } = pickedAt(
				{ email: member.email, choices },
				assignments,
				{ piece: piece.sheet?.title ?? item.title, concerts: concert.sheet ? [concert.sheet.title, concert.sheet.ref] : [] },
				config
			);
			for (const choice of played) {
				const match = matchParts(parts, choice, music);
				for (const part of [...match.own, ...match.shared]) {
					if (part.mimeType !== PDF || part.status === 'missing' || found.has(part.id)) continue;
					found.set(part.id, { id: part.id, label: part.label, piece: item.title, pieceId: piece.id, glyph: partGlyph(part) });
				}
			}
		}
	}
	return [...found.values()];
}
