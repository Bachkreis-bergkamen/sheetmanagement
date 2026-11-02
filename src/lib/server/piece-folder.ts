import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { fileWords } from '#lib/music/instrument-label.ts';
import { placeholderName } from '#lib/music/naming.ts';
import { pieceFolderName } from '#lib/music/piece-name.ts';
import { findPieceRow } from '#lib/repertoire/piece-edit.ts';
import { requireRight } from './auth/index.ts';
import { canConnectDrive, driveAccount, driveAccountClient } from './drive-account.ts';
import type { IndexedFile } from './drive-index.ts';
import { createFolder, createGoogleDoc, isFolderLike, listChildren, startUpload, trashFile } from './google/drive.ts';
import { getLibrary, type LibraryPiece } from './library.ts';
import { checkUploadNames } from './naming.ts';
import { driveWriteEnabled, getArchiveIndex, getGoogle, putInArchiveIndex, requireSetting } from './services.ts';
import { readTab, refreshAfterWrite, SheetLayoutError, updateRecord } from './sheet-writes.ts';

/**
 * New sheet music from the app (#193), for "archiv.bearbeiten": the piece folder with the
 * convention's name in the archive, PDFs uploaded from the browser straight to Drive with
 * convention names, and "- FEHLT" placeholders for parts still missing. Needs DRIVE_WRITE.
 */

const RIGHT = 'archiv.bearbeiten';
export const PDF = 'application/pdf';
/** Drive takes far more; a scanned part is a few MB, a whole score rarely 100. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const GOOGLE_DOC = 'application/vnd.google-apps.document';

export class FolderError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

/** What the piece page offers: a folder to create, or uploads into the one there is. */
export async function folderTools(locals: App.Locals, piece: LibraryPiece) {
	if (!locals.access.rights.has(RIGHT) || !driveWriteEnabled()) return null;
	if (!piece.detail) return piece.sheet ? { mode: 'create' as const, name: pieceFolderName(piece, config.naming) } : null;
	// Without a connected account only files already there can be replaced (see drive-account.ts).
	const account = canConnectDrive() ? await driveAccount() : null;
	return { mode: 'upload' as const, maxBytes: MAX_UPLOAD_BYTES, owner: account?.email, needsAccount: canConnectDrive() && !account };
}

async function pieceFor(locals: App.Locals, id: string): Promise<LibraryPiece> {
	requireRight(locals, RIGHT);
	if (!driveWriteEnabled()) throw new FolderError(409, t.pieceFolder.noDriveWrite);
	const piece = (await getLibrary()).piecesById.get(id);
	if (!piece) throw new FolderError(404, t.messages.noPiece);
	return piece;
}

/**
 * Creates the piece's folder in the archive and writes its id into the piece's row, so the
 * sheet row and the folder are one piece from now on. Returns the piece's new id (the folder's).
 */
export async function createPieceFolder(locals: App.Locals, pieceId: string, wanted: string): Promise<string> {
	const piece = await pieceFor(locals, pieceId);
	if (piece.detail) throw new FolderError(409, t.pieceFolder.exists);
	if (!piece.sheet) throw new FolderError(409, t.pieceFolder.notInSheet);
	const name = wanted.replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
	if (!name) throw new FolderError(400, t.pieceFolder.nameMissing);

	const index = (await getArchiveIndex()).value;
	if (index.pieces.some((other) => other.name.trim().toLowerCase() === name.toLowerCase())) throw new FolderError(409, t.pieceFolder.nameTaken(name));
	let table;
	try {
		table = await readTab('pieces');
	} catch (cause) {
		if (cause instanceof SheetLayoutError) throw new FolderError(409, cause.message);
		throw cause;
	}
	const row = findPieceRow(table, piece.sheet);
	if (!row) throw new FolderError(409, t.pieceFolder.notInSheet);

	const folder = await createFolder(getGoogle().client, name, requireSetting('DRIVE_ARCHIVE_FOLDER_ID'));
	await updateRecord('pieces', table, row.row, { driveFolderId: folder.id });
	// Nothing cached means nothing to patch: the next visitor reads the archive anyway.
	await putInArchiveIndex({ folderId: folder.id, name: folder.name, files: [] }).catch((cause) => console.error('Updating the cached archive failed:', cause));
	await refreshAfterWrite();
	return folder.id;
}

/** The convention name for each file the admin dropped on the page, where the parser is sure. */
export async function suggestNames(locals: App.Locals, pieceId: string, names: string[]) {
	const piece = await pieceFor(locals, pieceId);
	if (!piece.detail) throw new FolderError(409, t.pieceFolder.noFolder);
	const { shortTitle, checks } = checkUploadNames(piece.detail, names);
	return {
		shortTitle,
		files: checks.map((check) => ({
			name: check.name,
			suggested: check.state === 'ok' ? check.name : check.suggested,
			label: check.label
		}))
	};
}

/** A file name the convention allows: a PDF, no folders, not empty. */
export function uploadName(name: string): string | undefined {
	const clean = name.replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
	if (!clean || clean === '.pdf') return undefined;
	return /\.pdf$/i.test(clean) ? clean.replace(/\.pdf$/i, '.pdf') : `${clean}.pdf`;
}

/**
 * Opens an upload into the piece folder. A file of the same name there is replaced (a new
 * revision in Drive) instead of getting a second one next to it.
 */
export async function beginUpload(locals: App.Locals, pieceId: string, file: { name: string; size: number }, origin: string) {
	const piece = await pieceFor(locals, pieceId);
	if (!piece.detail) throw new FolderError(409, t.pieceFolder.noFolder);
	const name = uploadName(file.name);
	if (!name) throw new FolderError(400, t.pieceFolder.nameMissing);
	if (!(file.size > 0) || file.size > MAX_UPLOAD_BYTES) throw new FolderError(400, t.pieceFolder.tooLarge);
	const same = piece.detail.parts.find((part) => part.section === '' && part.mimeType === PDF && part.fileName.toLowerCase() === name.toLowerCase());
	// A new file belongs to whoever uploads it, and the service account has no storage: the
	// connected account (the archive's owner) uploads it. Replacing keeps the file's owner.
	const client = (!same && (await driveAccountClient())) || getGoogle().client;
	const url = await startUpload(client, { name, mimeType: PDF, size: file.size, folderId: piece.detail.id, replaceId: same?.id }, origin);
	return { url, name, replaces: !!same };
}

/**
 * After uploads or a new placeholder: reads the folder again (one request) and puts it into
 * the cached archive. A "- FEHLT" placeholder whose part has just been uploaded goes into the bin.
 */
export async function refreshPieceFolder(locals: App.Locals, pieceId: string): Promise<void> {
	const piece = await pieceFor(locals, pieceId);
	if (!piece.detail) return;
	const index = (await getArchiveIndex()).value;
	const indexed = index.pieces.find((other) => other.folderId === piece.detail!.id);
	if (!indexed) {
		await getArchiveIndex({ force: true });
		return;
	}
	const { client } = getGoogle();
	const entries = (await listChildren(client, [indexed.folderId])).filter((entry) => !isFolderLike(entry));
	const { separator, status } = config.naming;
	const pdfs = new Set(entries.filter((entry) => entry.mimeType === PDF).map((entry) => entry.name.replace(/\.pdf$/i, '').toLowerCase()));
	const filled = entries.filter(
		(entry) => entry.mimeType === GOOGLE_DOC && entry.name.endsWith(separator + status.missing) && pdfs.has(entry.name.slice(0, -(separator + status.missing).length).toLowerCase())
	);
	await Promise.all(filled.map((entry) => trashFile(client, entry.id).catch((cause) => console.error('Moving a filled placeholder to the bin failed:', cause))));
	const gone = new Set(filled.map((entry) => entry.id));
	const files: IndexedFile[] = entries
		.filter((entry) => !gone.has(entry.id))
		.map((entry) => ({ id: entry.id, name: entry.name, mimeType: entry.mimeType, modifiedTime: entry.modifiedTime, size: entry.size ? Number(entry.size) : undefined }));
	await putInArchiveIndex({ ...indexed, files: [...files, ...indexed.files.filter((file) => file.subfolder)] }).catch((cause) => console.error('Updating the cached archive failed:', cause));
}

/** "Stimme fehlt": the convention's placeholder, a Google Doc "<Kurztitel> - <Stimme> - FEHLT". */
export async function addPlaceholder(locals: App.Locals, pieceId: string, part: string): Promise<string> {
	const piece = await pieceFor(locals, pieceId);
	if (!piece.detail) throw new FolderError(409, t.pieceFolder.noFolder);
	const files = piece.detail.parts.filter((p) => p.section === '').map(({ id, fileName, mimeType }) => ({ id, name: fileName, mimeType }));
	// The form names the part as the app shows it; the file uses the convention's words.
	const name = placeholderName(files, piece.detail.title, fileWords(part), config.naming, piece.detail);
	const there = piece.detail.parts.some((p) => p.status === 'missing' && p.label === part);
	if (there || files.some((file) => file.name.toLowerCase() === name.toLowerCase())) throw new FolderError(409, t.pieceFolder.placeholderExists(name));
	await createGoogleDoc(getGoogle().client, name, piece.detail.id);
	await refreshPieceFolder(locals, pieceId);
	return name;
}
