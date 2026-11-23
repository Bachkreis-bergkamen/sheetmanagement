import type { LinkIcon, OrchestraLink } from '#lib/config/types.ts';

/**
 * Links people type into the sheet or a form end up in an href, so only web links pass:
 * a cell edited by hand must not become a javascript: link.
 */

/** The orchestra's links that are set and safe to show, with an icon each. */
export function orchestraLinks(links: OrchestraLink[] = []): { label: string; url: string; icon: LinkIcon }[] {
	return links.flatMap((link) => {
		const url = safeLink(link.url ?? '');
		const label = link.label?.trim();
		return url && label ? [{ label, url, icon: link.icon ?? 'globe' }] : [];
	});
}

/** The icon for a link's site; anything not known is a website. */
function iconFor(url: string): LinkIcon {
	const host = new URL(url).hostname.replace(/^(www|m)\./, '');
	if (host === 'instagram.com') return 'instagram';
	if (host === 'facebook.com' || host === 'fb.com') return 'facebook';
	if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
	return 'globe';
}

const SITE_NAMES: Partial<Record<LinkIcon, string>> = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube' };

/**
 * The orchestra's links as typed on /einstellungen or into ORCHESTRA_LINKS: each a web link,
 * with an optional name before it, one per line or separated by ";":
 * "Website https://example.org; Instagram https://www.instagram.com/orchester/".
 * Without a name, a known site is named after itself, any other after its host.
 */
export function parseLinks(text: string | undefined): OrchestraLink[] {
	const links: OrchestraLink[] = [];
	let rest = text ?? '';
	for (const match of rest.matchAll(/https?:\/\/[^\s;,<>"']+/g)) {
		const before = rest.slice(0, rest.indexOf(match[0]));
		rest = rest.slice(before.length + match[0].length);
		const url = safeLink(match[0]);
		if (!url) continue;
		const icon = iconFor(url);
		const named = before.replace(/^[\s;,]+|[\s;,:=|–-]+$/g, '').trim();
		links.push({ label: named || SITE_NAMES[icon] || new URL(url).hostname.replace(/^www\./, ''), url, icon });
	}
	return links;
}

/** The links as one line each, "Name https://…", for the field on /einstellungen. */
export const linksText = (links: OrchestraLink[]) => links.map((link) => `${link.label} ${link.url}`).join('\n');

/** "https://…" stays, anything else (javascript:, mailto:, plain text) is undefined. */
export function safeLink(text: string): string | undefined {
	const value = text.trim();
	if (!value) return undefined;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
	} catch {
		return undefined;
	}
}

/** The 11-character id of a YouTube video, from any of its link forms; undefined for other links. */
export function youtubeId(text: string): string | undefined {
	let url: URL;
	try {
		url = new URL(text.trim());
	} catch {
		return undefined;
	}
	const host = url.hostname.replace(/^(www|m|music)\./, '');
	const path = url.pathname.split('/').filter(Boolean);
	const id =
		host === 'youtu.be'
			? path[0]
			: host === 'youtube.com' || host === 'youtube-nocookie.com'
				? path[0] === 'watch'
					? url.searchParams.get('v')
					: ['shorts', 'embed', 'live', 'v'].includes(path[0])
						? path[1]
						: undefined
				: undefined;
	return id && /^[\w-]{11}$/.test(id) ? id : undefined;
}

/** "1m30s", "90s" or "90" → seconds; YouTube's start times. */
export function startSeconds(value: string | null): number | undefined {
	const match = value?.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
	if (!match || !value) return undefined;
	const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
	return seconds || undefined;
}

/** Parameters that only say where a link was shared from. */
const TRACKING = /^(utm_\w+|fbclid|gclid|si|feature|igshid|ref_src|mc_cid|mc_eid)$/;

/**
 * A recording link as it should be saved (#133): YouTube links in one form,
 * "https://www.youtube.com/watch?v=<id>", without share and playlist parameters (a start
 * time stays, it often points at the movement); other links without tracking parameters.
 * Anything that isn't a web link is undefined, like `safeLink`.
 */
export function cleanLink(text: string): string | undefined {
	const link = safeLink(text);
	if (!link) return undefined;
	const id = youtubeId(link);
	const url = new URL(link);
	if (id) {
		const start = startSeconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
		return `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`;
	}
	for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
	return url.toString();
}
