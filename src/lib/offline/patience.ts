/**
 * How long a kept page or a saved part may take before the copy on the device is shown instead
 * (#303): on a hall's weak Wi-Fi a request often hangs rather than fails.
 */
export const PATIENCE_MS = 4000;

/**
 * The network's answer, or after `ms` the copy on the device when there is one (#303); the
 * network's answer still arrives, and the service worker keeps it for next time. Without a copy it
 * waits for the network; a failed request falls back to the copy straight away, or rejects.
 */
export async function networkOr(fresh: Promise<Response>, kept: () => Promise<Response | undefined>, ms = PATIENCE_MS): Promise<Response> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<'late'>((resolve) => (timer = setTimeout(() => resolve('late'), ms)));
	const first = await Promise.race([fresh.catch(() => 'failed' as const), late]);
	clearTimeout(timer);
	if (first instanceof Response) return first;
	return (await kept()) ?? fresh;
}
