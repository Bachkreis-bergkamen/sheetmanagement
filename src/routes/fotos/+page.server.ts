import { error } from '@sveltejs/kit';
import { albumGroups, albumHref, albumWhen, albumYears, parseFilter } from '#lib/album/album.ts';
import { config } from '#lib/config/index.ts';
import * as t from '#lib/i18n/texts.ts';
import { albumStore, albumViewer } from '#lib/server/album.ts';
import { requireFeature } from '#lib/server/env.ts';
import type { PageServerLoad } from './$types';

/** The photo album (#66): every album with approved photos, newest first, by kind and year or decade. */
export const load: PageServerLoad = async ({ locals, url }) => {
	requireFeature('album');
	const viewer = await albumViewer(locals);
	if (!viewer) error(403, t.album.membersOnly);
	const store = await albumStore();
	if (!store) return { state: 'not-set-up' as const };
	const filter = parseFilter(url.searchParams);
	const [photos, films, comments, waiting] = await Promise.all([store.photos({ status: 'approved' }), store.videos({ status: 'approved' }), store.commentCounts(), viewer.approves ? store.pendingCount() : 0]);
	// A recording files under its album's title, like a photo.
	const videos = films.map((video) => ({ ...video, title: video.albumTitle }));
	return {
		state: 'ready' as const,
		filter,
		...albumYears(photos, videos),
		total: photos.length + videos.length,
		waiting,
		albums: albumGroups(photos, filter, videos).map((group) => ({
			...group,
			href: albumHref(group.album),
			when: albumWhen(group.day, config.locale),
			comments: comments.get(group.album) ?? 0
		}))
	};
};
