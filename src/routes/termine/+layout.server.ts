import { requireFeature } from '#lib/server/env.ts';
import type { LayoutServerLoad } from './$types';

/** Date polls (#395): the pages below don't exist while the orchestra turned the feature off. */
export const load: LayoutServerLoad = () => {
	requireFeature('polls');
};
