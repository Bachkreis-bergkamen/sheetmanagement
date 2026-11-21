/**
 * An object whose fields are each built the first time they're read, then kept (#355). A
 * builder that throws isn't kept, so the next read tries it again.
 */
export function lazyFields<T extends object>(builders: { [K in keyof T]: () => T[K] }): T {
	const fields = {} as T;
	for (const key of Object.keys(builders) as (keyof T)[]) {
		Object.defineProperty(fields, key, {
			enumerable: true,
			configurable: true,
			get() {
				const value = builders[key]();
				Object.defineProperty(fields, key, { value, enumerable: true });
				return value;
			}
		});
	}
	return fields;
}
