import { config } from '#lib/config/index.ts';
import type { Catalog } from '#lib/music/catalog.ts';
import { checkSection, guessShortTitle, type NameCheck, type NamingFile } from '#lib/music/naming.ts';
import { createInstrumentMatcher, type InstrumentMatcher } from '#lib/music/part-name.ts';
import type { PieceDetail } from '#lib/music/types.ts';
import { folderUrl } from './catalog.ts';
import type { Library } from './library.ts';

/** One folder (or subfolder) of the archive as the naming check sees it. */
export interface NamingSection {
	/** "<piece id>:<section key>", stable across reloads. */
	key: string;
	pieceId: string;
	folderName: string;
	/** "2. Satz" for a subfolder, empty for the files directly in the piece folder. */
	section: string;
	/** The folder in Drive the files are in (the subfolder for a movement). */
	folderUrl: string;
	files: NamingFile[];
	/** The guessed short title the suggestions start from; people may change it. */
	shortTitle: string;
	movement?: number;
	titles: string[];
}

let built: { instruments: typeof config.instruments; matcher: InstrumentMatcher } | undefined;
/** Built again when a deployment's own spellings change (#143). */
function matcher(): InstrumentMatcher {
	if (built?.instruments !== config.instruments) built = { instruments: config.instruments, matcher: createInstrumentMatcher(config.instruments) };
	return built.matcher;
}

/** Every section of the archive with its files, in archive order. */
export function namingSections(library: Library): NamingSection[] {
	return library.pieces.flatMap((piece) => (piece.detail ? sectionsOf(piece.detail) : []));
}

/**
 * Just the one section a rename is for. Working out every folder's short title on each
 * small rename batch costs a Worker's whole CPU allowance on a large archive.
 */
export function namingSection(catalog: Catalog, key: string): NamingSection | undefined {
	const detail = catalog.byId.get(key.slice(0, key.indexOf(':')));
	return detail && sectionsOf(detail).find((section) => section.key === key);
}

function sectionsOf(detail: PieceDetail): NamingSection[] {
	return detail.sections.map((section): NamingSection => {
		const files = detail.parts
			.filter((part) => part.section === section.key)
			.map(({ id, fileName, mimeType }) => ({ id, name: fileName, mimeType }));
		const movement = Number(/^(\d+)\. Satz/.exec(section.label)?.[1]) || undefined;
		return {
			key: `${detail.id}:${section.key}`,
			pieceId: detail.id,
			folderName: detail.folderName,
			section: section.label,
			folderUrl: folderUrl(section.folderId),
			files,
			shortTitle: guessShortTitle(files, detail.title, config.naming, detail),
			movement,
			// A subfolder like "Section II" names its files too: "Section II Violine".
			titles: [detail.folderName, detail.title, ...(movement ? [] : [section.label])]
		};
	});
}

export function checkNamingSection(section: NamingSection, shortTitle = section.shortTitle): NameCheck[] {
	return checkSection(section.files, shortTitle, config.naming, matcher(), { movement: section.movement, titles: section.titles });
}

/**
 * Convention names for files about to be uploaded into a piece folder (#193), read from
 * their old names like the batch rename does: the short title the folder's files already
 * use (else one made from the title). "unclear" ones are named by a person.
 */
export function checkUploadNames(detail: PieceDetail, names: string[]): { shortTitle: string; checks: NameCheck[] } {
	const existing = detail.parts.filter((part) => part.section === '').map(({ id, fileName, mimeType }) => ({ id, name: fileName, mimeType }));
	const shortTitle = guessShortTitle(existing, detail.title, config.naming, detail);
	const files = names.map((name, i) => ({ id: String(i), name, mimeType: 'application/pdf' }));
	return { shortTitle, checks: checkSection(files, shortTitle, config.naming, matcher(), { titles: [detail.folderName, detail.title] }) };
}
