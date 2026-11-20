/** Small text helpers several modules share (#353). */

/** A switch in the environment: true, 1, yes or on, in any case and with spaces around it. */
export const switchedOn = (value: string | undefined): boolean => ['true', '1', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());

/** Sorts names and titles the German way: case and accents don't count, "Teil 2" comes before "Teil 10". */
export const germanCollator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
