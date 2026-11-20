import { formatDuration } from '#lib/repertoire/duration.ts';

/**
 * A YouTube video's length as the editor writes a duration ("4:32"), asked from /api/youtube
 * (#133). Null when YouTube names none; throws when it can't be asked. A video asked once in this
 * tab isn't asked again: its length doesn't change.
 */
const known = new Map<string, Promise<string | null>>();

export function videoLength(id: string): Promise<string | null> {
	let length = known.get(id);
	if (!length) {
		length = fetch(`/api/youtube/${id}`).then(async (response) => {
			if (!response.ok) throw new Error(String(response.status));
			const { seconds } = (await response.json()) as { seconds: number | null };
			return seconds ? formatDuration(seconds) : null;
		});
		// A failed lookup may work next time.
		length.catch(() => known.delete(id));
		known.set(id, length);
	}
	return length;
}
