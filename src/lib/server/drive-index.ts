import { GoogleApiError, type GoogleClient } from './google/client.ts';
import {
	contentId,
	getFile,
	getStartPageToken,
	isFolderLike,
	listChanges,
	listChildren,
	SHORTCUT_MIME,
	type DriveChange,
	type DriveFile
} from './google/drive.ts';

/**
 * A snapshot of the sheet music in Drive: one entry per piece folder with its files,
 * from the archive and from the current-programme folders. File and folder names are
 * kept raw here; parsing them (title, composer, part) is a separate step, so the index
 * stays valid when the parsing rules change.
 */
export interface DriveIndex {
	version: 3;
	archiveFolderId: string;
	builtAt: string;
	/** Google API requests the crawl needed (free Workers allow 50 per invocation). */
	requestCount: number;
	pieces: IndexedPiece[];
	/** Programme names in the order of the configured folders, e.g. ["A-Orchester", "Ehemaligenorchester"]. */
	programs: string[];
	/** Files lying directly in a category folder, e.g. a running order for the Christmas pieces. */
	categoryFiles: { category: string; files: IndexedFile[] }[];
	/**
	 * For updating from Drive's changes list instead of reading the whole archive again
	 * (updateDriveIndex). Missing in an index built without it: the next update reads it all.
	 */
	changes?: IndexChanges;
}

export interface IndexChanges {
	/** Drive's changes list continues from here. */
	token: string;
	/** When the whole archive was last read; it's read again once a day in case anything was missed. */
	crawledAt: string;
	/** Category folders (content ids), whose loose files and piece folders the index lists. */
	categories: string[];
	/** Programme folders (content ids), linked ones included, whose piece folders the index lists. */
	programs: string[];
	/** Ids of what lies in the archive, a category or a programme folder (shortcut ids as they are). */
	entries: string[];
	/** Subfolder id → its piece folder, empty ones too, so a file put in one is noticed. */
	subfolders: Record<string, string>;
}

export interface IndexedPiece {
	folderId: string;
	name: string;
	/** Display name of the category folder it sits in, e.g. "Weihnachtsstücke". */
	category?: string;
	/** Current programmes it's in, e.g. ["Ehemaligenorchester", "A-Orchester"]. */
	programs?: string[];
	files: IndexedFile[];
}

export interface IndexedFile {
	id: string;
	name: string;
	mimeType: string;
	modifiedTime?: string;
	size?: number;
	/** Name of the subfolder inside the piece folder, if the file is not directly in it. */
	subfolder?: string;
	subfolderId?: string;
}

export const INDEX_VERSION = 3;

/** Programme folders can link to each other ("Programm A-Orchester" inside the EO's); this deep at most. */
const MAX_PROGRAM_DEPTH = 3;

export interface IndexOptions {
	archiveFolderId: string;
	/** Folders inside the archive that group pieces; the first group is the category name. */
	categoryFolderPattern: RegExp;
	/** Current-programme folders, one per orchestra or ensemble. */
	programFolderIds?: string[];
	/** Folder names that are a programme rather than a piece; the first group is its name. */
	programFolderPattern?: RegExp;
	/** Note where Drive's changes list starts, so later updates can read only what changed. */
	trackChanges?: boolean;
}

/** Pieces whose files are taken from an earlier index instead of being listed again. */
interface Reuse {
	previous: DriveIndex;
	/** Piece folders to list again even though the earlier index has them. */
	refresh: Set<string>;
	changes: Pick<IndexChanges, 'token' | 'crawledAt'>;
}

function toIndexedFile(file: DriveFile, subfolder?: { id: string; name: string }): IndexedFile {
	const isShortcut = file.mimeType === SHORTCUT_MIME && file.shortcutDetails;
	return {
		id: contentId(file),
		name: file.name,
		mimeType: isShortcut ? file.shortcutDetails!.targetMimeType : file.mimeType,
		modifiedTime: file.modifiedTime,
		size: file.size ? Number(file.size) : undefined,
		...(subfolder ? { subfolder: subfolder.name, subfolderId: subfolder.id } : {})
	};
}

/** Finds which of the known folders a file belongs to. */
function parentIn<T>(file: DriveFile, folders: Map<string, T>): T | undefined {
	for (const parent of file.parents ?? []) {
		const folder = folders.get(parent);
		if (folder) return folder;
	}
	return undefined;
}

/**
 * Crawls in a fixed, small number of batched requests:
 * archive → category folders, programme folders (→ linked programmes), then the files
 * of all pieces → one level of subfolders.
 */
export async function buildDriveIndex(client: GoogleClient, options: IndexOptions, reuse?: Reuse): Promise<DriveIndex> {
	const { archiveFolderId, categoryFolderPattern, programFolderIds = [], programFolderPattern, trackChanges = false } = options;
	const before = client.requestCount;
	// Taken before reading, so a change made while the crawl runs is listed next time, not lost.
	const token = reuse ? reuse.changes.token : trackChanges ? await getStartPageToken(client).catch(() => undefined) : undefined;
	const entries = new Set<string>();
	const programFolders = new Set<string>();
	const pieces = new Map<string, IndexedPiece>();
	const addPiece = (folder: DriveFile, category?: string, programs: string[] = []) => {
		const id = contentId(folder);
		const piece = pieces.get(id) ?? { folderId: id, name: folder.name, category, files: [] };
		if (programs.length) piece.programs = [...new Set([...(piece.programs ?? []), ...programs])];
		pieces.set(id, piece);
	};

	// 1. Archive top level: piece folders and category folders.
	const categories = new Map<string, string>();
	for (const entry of await listChildren(client, [archiveFolderId])) {
		if (!isFolderLike(entry)) continue;
		entries.add(entry.id);
		const category = entry.name.match(categoryFolderPattern)?.[1]?.trim();
		if (category) categories.set(contentId(entry), category);
		else addPiece(entry);
	}

	// 2. Piece folders inside category folders, and loose files there (e.g. a running order).
	const categoryFiles = new Map<string, IndexedFile[]>();
	if (categories.size > 0) {
		for (const entry of await listChildren(client, [...categories.keys()])) {
			const category = parentIn(entry, categories);
			if (!category) continue;
			entries.add(entry.id);
			if (isFolderLike(entry)) addPiece(entry, category);
			else categoryFiles.set(category, [...(categoryFiles.get(category) ?? []), toIndexedFile(entry)]);
		}
	}

	// 3. Current programmes. A folder's programme name comes from "Programm <Name>", or for a
	//    configured folder from its whole name ("01 | Aktuelles Programm" → "Aktuelles Programm").
	//    A programme folder inside another (often a shortcut) passes its pieces on: they're
	//    in both programmes.
	//    A configured folder that isn't itself a programme (the "Aktuelles Programm" parent)
	//    only names the pieces lying directly in it, not those of the programmes inside it.
	const programName = (name: string) => programFolderPattern?.exec(name)?.[1]?.trim();
	const order: string[] = [];
	/** Per folder: names for its own pieces, and names it passes on to programmes inside it. */
	let frontier = new Map<string, { own: string[]; passOn: string[] }>();
	for (const id of [...new Set(programFolderIds)]) {
		const folder = await getFile(client, id);
		const program = programName(folder.name);
		const name = program ?? folder.name.match(categoryFolderPattern)?.[1]?.trim() ?? folder.name;
		order.push(name);
		frontier.set(id, { own: [name], passOn: program ? [name] : [] });
		programFolders.add(id);
	}
	const reached = new Map<string, Set<string>>();
	for (let depth = 0; depth < MAX_PROGRAM_DEPTH && frontier.size > 0; depth++) {
		const next = new Map<string, { own: string[]; passOn: string[] }>();
		for (const entry of await listChildren(client, [...frontier.keys()])) {
			const parent = parentIn(entry, frontier);
			if (!parent || !isFolderLike(entry)) continue;
			entries.add(entry.id);
			const nested = programName(entry.name);
			if (!nested) {
				addPiece(entry, undefined, parent.own);
				continue;
			}
			if (!order.includes(nested)) order.push(nested);
			// Visit a programme again only if it brings new names, so links in circles end.
			const id = contentId(entry);
			const known = reached.get(id) ?? new Set();
			const names = [...new Set([...(next.get(id)?.own ?? []), ...parent.passOn, nested])];
			if (names.some((name) => !known.has(name))) {
				next.set(id, { own: names, passOn: names });
				programFolders.add(id);
				reached.set(id, new Set([...known, ...names]));
			}
		}
		frontier = next;
	}
	const used = new Set([...pieces.values()].flatMap((piece) => piece.programs ?? []));
	const programs = order.filter((name) => used.has(name));

	// 4-5. Files of the pieces, except those an earlier index already has unchanged.
	const known = new Map(reuse?.previous.pieces.map((piece) => [piece.folderId, piece]));
	const subfolderIds: Record<string, string> = {};
	const toList: IndexedPiece[] = [];
	for (const piece of pieces.values()) {
		const earlier = known.get(piece.folderId);
		if (!earlier || reuse!.refresh.has(piece.folderId)) {
			toList.push(piece);
			continue;
		}
		piece.files = earlier.files;
		for (const [subfolder, folderId] of Object.entries(reuse!.previous.changes?.subfolders ?? {})) {
			if (folderId === piece.folderId) subfolderIds[subfolder] = folderId;
		}
	}
	Object.assign(subfolderIds, await listPieceFiles(client, toList));

	const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
	const sorted = [...pieces.values()].sort((a, b) => collator.compare(a.name, b.name));
	for (const piece of sorted) piece.files.sort((a, b) => collator.compare(a.name, b.name));

	return {
		version: INDEX_VERSION,
		archiveFolderId,
		builtAt: new Date().toISOString(),
		requestCount: client.requestCount - before,
		pieces: sorted,
		programs,
		categoryFiles: [...categoryFiles].map(([category, files]) => ({ category, files })),
		...(token
			? {
					changes: {
						token,
						crawledAt: reuse?.changes.crawledAt ?? new Date().toISOString(),
						categories: [...categories.keys()],
						programs: [...programFolders],
						entries: [...entries],
						subfolders: subfolderIds
					}
				}
			: {})
	};
}

/**
 * Lists the files of these pieces into them (4.), and those of one level of subfolders such
 * as "Sections" (5.; deeper levels are ignored). Returns the subfolders: id → piece folder.
 */
async function listPieceFiles(client: GoogleClient, pieces: IndexedPiece[]): Promise<Record<string, string>> {
	const byId = new Map(pieces.map((piece) => [piece.folderId, piece]));
	const subfolders = new Map<string, { piece: IndexedPiece; id: string; name: string }>();
	if (byId.size > 0) {
		for (const entry of await listChildren(client, [...byId.keys()])) {
			const piece = parentIn(entry, byId);
			if (!piece) continue;
			if (isFolderLike(entry)) subfolders.set(contentId(entry), { piece, id: contentId(entry), name: entry.name });
			else piece.files.push(toIndexedFile(entry));
		}
	}
	if (subfolders.size > 0) {
		for (const entry of await listChildren(client, [...subfolders.keys()])) {
			const subfolder = parentIn(entry, subfolders);
			if (subfolder && !isFolderLike(entry)) subfolder.piece.files.push(toIndexedFile(entry, subfolder));
		}
	}
	return Object.fromEntries([...subfolders].map(([id, { piece }]) => [id, piece.folderId]));
}

/** The whole archive is read again this often anyway, in case the changes list missed something. */
export const FULL_CRAWL_MS = 24 * 60 * 60 * 1000;

/**
 * What a list of changes means for the index: `structure` when the archive's layout changed
 * (a piece folder added, moved, renamed or removed; a category or programme changed), and
 * the piece folders whose files changed. Changes elsewhere in Drive are left out.
 */
export function classifyChanges(index: DriveIndex, changes: DriveChange[]): { structure: boolean; pieces: Set<string> } {
	const tracked = index.changes!;
	const containers = new Set([index.archiveFolderId, ...tracked.categories, ...tracked.programs]);
	const categories = new Set(tracked.categories);
	const entries = new Set(tracked.entries);
	const pieceIds = new Set(index.pieces.map((piece) => piece.folderId));
	const fileToPiece = new Map(index.pieces.flatMap((piece) => piece.files.map((file) => [file.id, piece.folderId] as const)));
	const subfolders = new Map(Object.entries(tracked.subfolders));
	const pieces = new Set<string>();
	let structure = false;

	for (const { fileId, file } of changes) {
		if (containers.has(fileId) || entries.has(fileId) || pieceIds.has(fileId)) structure = true;
		// Where it was: a file of a piece, or one of its subfolders.
		const was = fileToPiece.get(fileId) ?? subfolders.get(fileId);
		if (was) pieces.add(was);
		// Where it is now. A file deleted for good has no parents left to look at; `was` covers it.
		for (const parent of file?.parents ?? []) {
			if (containers.has(parent) && (isFolderLike(file!) || categories.has(parent))) structure = true;
			const piece = pieceIds.has(parent) ? parent : subfolders.get(parent);
			if (piece) pieces.add(piece);
		}
	}
	return { structure, pieces };
}

/** Drive doesn't know the token any more (too old, or another account): only a full read helps. */
const tokenGone = (error: unknown) => error instanceof GoogleApiError && [400, 403, 404, 410].includes(error.status);

/**
 * Brings an index up to date from Drive's changes list: a handful of requests and little CPU,
 * where reading the whole archive again takes far more than the free plan's 10 ms. Only the
 * pieces whose files changed are listed again; when the archive's layout changed, its folders
 * are read again but unchanged pieces keep their files. Reads everything when the index has
 * no token, Drive no longer knows it, there are too many changes, or once a day.
 */
export async function updateDriveIndex(client: GoogleClient, previous: DriveIndex, options: IndexOptions, now = Date.now()): Promise<DriveIndex> {
	const full = () => buildDriveIndex(client, { ...options, trackChanges: true });
	const tracked = previous.changes;
	if (!tracked || !(now - Date.parse(tracked.crawledAt) < FULL_CRAWL_MS)) return full();

	const before = client.requestCount;
	let listed: Awaited<ReturnType<typeof listChanges>>;
	try {
		listed = await listChanges(client, tracked.token);
	} catch (error) {
		if (tokenGone(error)) return full();
		throw error;
	}
	if (!listed) return full();

	const { structure, pieces } = classifyChanges(previous, listed.changes);
	const changes = { token: listed.newStartPageToken, crawledAt: tracked.crawledAt };
	if (structure) {
		const index = await buildDriveIndex(client, options, { previous, refresh: pieces, changes });
		return { ...index, requestCount: client.requestCount - before };
	}
	if (!pieces.size) {
		// Nothing in the archive changed: the same builtAt, so the catalog built from it stays valid.
		return { ...previous, requestCount: client.requestCount - before, changes: { ...tracked, token: changes.token } };
	}

	const updated = previous.pieces.map((piece) => (pieces.has(piece.folderId) ? { ...piece, files: [] } : piece));
	const listedSubfolders = await listPieceFiles(
		client,
		updated.filter((piece) => pieces.has(piece.folderId))
	);
	const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
	for (const piece of updated) if (pieces.has(piece.folderId)) piece.files.sort((a, b) => collator.compare(a.name, b.name));
	const keptSubfolders = Object.entries(tracked.subfolders).filter(([, folderId]) => !pieces.has(folderId));
	return {
		...previous,
		builtAt: new Date(now).toISOString(),
		requestCount: client.requestCount - before,
		pieces: updated,
		changes: { ...tracked, token: changes.token, subfolders: { ...Object.fromEntries(keptSubfolders), ...listedSubfolders } }
	};
}
