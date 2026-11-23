import { requireFeature } from '#lib/server/env.ts';
import type { LayoutServerLoad } from './$types';

/** The parents' messages go to the Leitung through the Kummerkasten (#395): without it, they're gone too. */
export const load: LayoutServerLoad = () => {
	requireFeature('kummer');
};
