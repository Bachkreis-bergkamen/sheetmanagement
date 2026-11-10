import type { OrchestraConfig } from '#lib/config/index.ts';
import type { DriveIndex, IndexedFile, IndexedPiece } from '#lib/server/drive-index.ts';
import { createInstrumentMatcher, parsePartName, type InstrumentMatcher } from './part-name.ts';
import { parsePieceName } from './piece-name.ts';
import { byLabel, compareSections, sectionName, sharedMovement, type SectionName } from './sections.ts';
import { searchText, sharedPrefix } from './text.ts';
import type { Part, PieceDetail, PieceStatus, Section } from './types.ts';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

const isReal = (part: Part) => part.kind !== 'audio' && part.kind !== 'sonstiges';

function buildPiece(piece: IndexedPiece, config: OrchestraConfig, matcher: InstrumentMatcher): PieceDetail {
	const { featuredPrefix, movementNote = 'Satz' } = config.naming;
	const withoutFeatured = (name: string) =>
		name.startsWith(featuredPrefix) ? name.slice(featuredPrefix.length).trim() : name;

	// Files directly in the folder and per subfolder are separate sections.
	const groups = new Map<string, IndexedFile[]>();
	for (const file of piece.files) {
		if (file.mimeType === FOLDER_MIME) continue;
		const key = file.subfolderId ?? '';
		groups.set(key, [...(groups.get(key) ?? []), file]);
	}
	const single = groups.size <= 1;

	const named: { key: string; name: SectionName; files: IndexedFile[]; folderId: string }[] = [...groups].map(
		([key, files]) => {
			if (key) return { key, name: sectionName(files[0].subfolder ?? ''), files, folderId: key };
			const movement = sharedMovement(files.map((file) => file.name));
			const name: SectionName = movement
				? { label: `${movement}. Satz`, kind: 'played', movement }
				: { label: single ? '' : 'Gespielte Fassung', kind: 'played' };
			return { key, name, files, folderId: piece.folderId };
		}
	);
	named.sort((a, b) => compareSections(a.name, b.name));

	const parts: Part[] = [];
	const sections: Section[] = [];
	for (const { key, name, files, folderId } of named) {
		// Each section has its own shared prefix ("Mendelssohn 4 - Satz 2 - "), so it's cut cleanly.
		const prefix = sharedPrefix(files.map((file) => withoutFeatured(file.name)));
		// Inside "1. Satz" a "Satz 1" note on every part says nothing new.
		const redundant = name.movement ? `${movementNote} ${name.movement}` : undefined;
		const sectionParts = files
			.map((file): Part => {
				const parsed = parsePartName(file.name, file.mimeType, config.naming, matcher, prefix);
				return {
					id: file.id,
					fileName: file.name,
					label: parsed.label,
					kind: parsed.kind,
					family: parsed.family,
					instruments: parsed.instruments,
					voices: parsed.voices,
					notes: parsed.notes.filter((note) => note !== redundant),
					status: parsed.status,
					mimeType: file.mimeType,
					...(file.subfolder ? { subfolder: file.subfolder } : {}),
					section: key,
					order: parsed.order
				};
			})
			.sort((a, b) => a.order - b.order || byLabel.compare(a.label, b.label));
		parts.push(...sectionParts);
		sections.push({
			key,
			label: name.label,
			kind: name.kind,
			folderId,
			partCount: sectionParts.filter((part) => isReal(part) && part.status !== 'missing').length
		});
	}

	// Gaps anywhere count, but the number of parts is that of the section people play.
	const real = parts.filter(isReal);
	const status: PieceStatus =
		real.length === 0
			? 'empty'
			: real.some((part) => part.status === 'missing')
				? 'missing'
				: real.some((part) => part.status === 'empty' || part.status === 'incomplete')
					? 'incomplete'
					: 'ok';
	// The conductor needs a score; a placeholder (FEHLT) is none.
	const noScore = real.length > 0 && !parts.some((part) => part.kind === 'partitur' && part.status !== 'missing');

	const name = parsePieceName(piece.name, config.naming);
	return {
		id: piece.folderId,
		folderName: piece.name,
		title: name.title,
		composer: name.composer,
		catalogue: name.catalogue,
		category: piece.category,
		programs: piece.programs ?? [],
		partCount: sections[0]?.partCount ?? 0,
		status,
		...(noScore ? { noScore } : {}),
		search: searchText(name.title, name.composer, name.catalogue, piece.category, ...(piece.programs ?? []), piece.name),
		parts,
		sections
	};
}

export interface Catalog {
	pieces: PieceDetail[];
	/** Programme names in display order. */
	programs: string[];
	/** Loose files in category folders, e.g. a running order for the Christmas concert. */
	categoryFiles: Record<string, IndexedFile[]>;
	byId: Map<string, PieceDetail>;
}

export function buildCatalog(index: DriveIndex, config: OrchestraConfig): Catalog {
	const matcher = createInstrumentMatcher(config.instruments);
	const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
	const pieces = index.pieces
		.map((piece) => buildPiece(piece, config, matcher))
		.sort((a, b) => collator.compare(a.title, b.title));
	return {
		pieces,
		programs: index.programs ?? [],
		categoryFiles: Object.fromEntries((index.categoryFiles ?? []).map(({ category, files }) => [category, files])),
		byId: new Map(pieces.map((piece) => [piece.id, piece]))
	};
}
