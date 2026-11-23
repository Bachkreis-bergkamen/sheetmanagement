import { FULL_EDGE, THUMB_EDGE } from './album.ts';

/**
 * Photos made smaller on the device before they're sent (#66): a phone photo of 5 MB becomes a
 * few hundred KB, the upload is quick on mobile data, and R2 stays small. Drawing it onto a
 * canvas also leaves behind everything the camera wrote into the file, the location included.
 */

export interface PreparedPhoto {
	name: string;
	full: Blob;
	thumb: Blob;
	width: number;
	height: number;
	/** A local address for the preview; revoke it with URL.revokeObjectURL when done. */
	preview: string;
}

const scaled = (width: number, height: number, edge: number) => {
	const factor = Math.min(1, edge / Math.max(width, height));
	return { width: Math.round(width * factor), height: Math.round(height * factor) };
};

async function encode(image: ImageBitmap, edge: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
	const size = scaled(image.width, image.height, edge);
	const canvas = document.createElement('canvas');
	canvas.width = size.width;
	canvas.height = size.height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('No 2D canvas');
	context.imageSmoothingQuality = 'high';
	context.drawImage(image, 0, 0, size.width, size.height);
	const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', quality));
	if (!blob) throw new Error('Encoding failed');
	return { blob, ...size };
}

/** One photo, turned the right way up, as a large JPEG and a thumbnail; throws for what isn't a picture. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
	const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
	try {
		const full = await encode(image, FULL_EDGE, 0.85);
		const thumb = await encode(image, THUMB_EDGE, 0.8);
		return { name: file.name, full: full.blob, thumb: thumb.blob, width: full.width, height: full.height, preview: URL.createObjectURL(thumb.blob) };
	} finally {
		image.close();
	}
}
