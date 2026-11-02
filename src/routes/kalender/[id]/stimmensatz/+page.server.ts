import { error } from '@sveltejs/kit';
import { countingMembers } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { parseInstruments, playedParts } from '#lib/music/my-parts.ts';
import { partSet } from '#lib/music/part-set.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { getLibrary } from '#lib/server/library.ts';
import { getAccessList, getMusicConfig, getPartAssignments } from '#lib/server/repertoire.ts';
import { choicesAt } from '#lib/music/part-assignments.ts';
import type { PageServerLoad } from './$types';

/**
 * A full set of parts for a concert (#195): per piece of the programme, the copies of each part
 * from who plays what, to check and change, then printed as one PDF built in the browser.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	requireRight(locals, 'stuecke.bearbeiten');
	const [library, access, music, assignments] = await Promise.all([getLibrary(), getAccessList(), getMusicConfig(), getPartAssignments()]);
	const concert = library.concertsById.get(params.id);
	if (!concert) error(404, t.messages.noConcert);
	// Everyone active in the concert's orchestra, with each of their instruments.
	const members = countingMembers(access?.members ?? [], concert.orchestra, library.today);
	return {
		back: { href: `/kalender/${encodeURIComponent(concert.id)}`, label: concert.title },
		title: concert.title,
		date: concert.label?.long ?? concert.dateText,
		players: members.length,
		pieces: concert.program.map((item) => {
			const piece = item.pieceId ? library.piecesById.get(item.pieceId) : undefined;
			const parts = piece?.detail ? playedParts(piece.detail) : [];
			// Each player with what they play in this piece: their own instruments, or the part assigned to them (#262).
			const occasion = { piece: piece?.sheet?.title ?? item.title, concerts: concert.sheet ? [concert.sheet.title] : [] };
			const players = members.flatMap((member) =>
				choicesAt({ email: member.email, choices: parseInstruments(member.instrument ?? '', music) }, assignments.assignments, occasion, music)
			);
			return { title: item.title, pieceId: item.pieceId ?? undefined, parts: partSet(parts, players, music) };
		})
	};
};
