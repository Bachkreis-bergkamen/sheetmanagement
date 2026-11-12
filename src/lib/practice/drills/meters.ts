/**
 * The time signatures of the drills: 2/4, 3/4 and 4/4 counted in quarters, 6/8 in eighths and
 * conducted in six. A meter is named by its beats in a bar (6 is 6/8), the number the conductor
 * draws. Lengths are in sixteenths, as everywhere in the drills.
 */
export type DrillMeter = 2 | 3 | 4 | 6;

export const DRILL_METERS: DrillMeter[] = [2, 3, 4, 6];

export const isDrillMeter = (value: unknown): value is DrillMeter => DRILL_METERS.includes(value as DrillMeter);

/** Sixteenths in one beat: a quarter, or in 6/8 an eighth. */
export const beatLength = (meter: DrillMeter) => (meter === 6 ? 2 : 4);

/** Sixteenths in a bar. */
export const barLength = (meter: DrillMeter) => meter * beatLength(meter);

/** The note under the time signature: 4 or 8. */
export const meterUnit = (meter: DrillMeter) => (meter === 6 ? 8 : 4);

/** "6/8". */
export const meterName = (meter: DrillMeter) => `${meter}/${meterUnit(meter)}`;

/**
 * Sixteenths beamed together: short notes are beamed within a quarter, in 6/8 within each
 * dotted quarter, as the bar is felt.
 */
export const beamLength = (meter: DrillMeter) => (meter === 6 ? 6 : 4);

/** Beats of count-in: a bar, or two of 2/4 so there's time to feel the tempo. */
export const countInBeats = (meter: DrillMeter) => (meter === 2 ? 4 : meter);

/**
 * The beats per minute a level's quarter tempo is played at in this meter. 6/8 is felt in
 * dotted quarters, two-thirds of the quarter tempo (72 → 48), and its eighths, three to each,
 * are the beat the conductor gives: a whole number of dotted quarters, so the tempo mark reads
 * as printed music does.
 */
export const beatsPerMinute = (quarterBpm: number, meter: DrillMeter) => (meter === 6 ? Math.round((quarterBpm * 2) / 3) * 3 : quarterBpm);

/** The tempo as written above the music: quarters, or in 6/8 dotted quarters (eighths ÷ 3). */
export const markedTempo = (bpm: number, meter: DrillMeter) => (meter === 6 ? Math.round(bpm / 3) : bpm);
