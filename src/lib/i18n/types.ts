import type * as de from './de/index.ts';

/** A text table's shape with any wording: the German strings' literal types become string. */
type Widen<T> = T extends string
	? string
	: T extends (...args: infer A) => infer R
		? (...args: A) => Widen<R>
		: T extends readonly (infer U)[]
			? Widen<U>[]
			: T extends object
				? { readonly [K in keyof T]: Widen<T[K]> }
				: T;

/** Every text of the app; each language has all of them, which the type checker makes sure of. */
export type Texts = Widen<typeof de>;
