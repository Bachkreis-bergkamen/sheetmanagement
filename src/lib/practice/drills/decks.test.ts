import { describe, expect, it } from "vitest";
import {
  CHORD_ORDER,
  EAR_DECK,
  EAR_ORDER,
  interleave,
  intervalOptions,
  KEY_ORDER,
  keyOptions,
  kindOf,
  noteOrder,
  notesOrder,
  playOrder,
  questionFor,
  transOrder,
} from "./decks.ts";
import { RHYTHM_ORDER } from "./rhythm.ts";
import { midiOf, pitchOf, staffPosition } from "./theory.ts";

describe("noteOrder", () => {
  it("starts at the clef’s landmark and learns the staff before the ledger lines", () => {
    const treble = noteOrder("treble");
    expect(treble.slice(0, 3)).toEqual([2, 1, 3]);
    expect(treble.slice(0, 9).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(treble.slice(9, 11)).toEqual([-1, 9]);
    expect(treble.at(-1)).toBe(14);
    expect(noteOrder("bass")[0]).toBe(6);
    expect(noteOrder("alto")[0]).toBe(4);
  });

  it("keeps to an instrument’s range", () => {
    // A violin goes no lower than G3: two ledger lines and a space below the staff.
    const violin = playOrder("violin", "treble");
    const lowest = staffPosition("treble", pitchOf("G3"));
    expect(violin).toContain(`play:violin:treble:${lowest}`);
    expect(violin).not.toContain(`play:violin:treble:${lowest - 1}`);
    expect(playOrder("violin", "bass")).toEqual([]);
  });

  it("gives every note a question", () => {
    expect(notesOrder("treble")[0]).toBe("notes:treble:2");
    expect(questionFor("notes:treble:2", "treble")).toEqual({
      kind: "notes",
      id: "notes:treble:2",
      clef: "treble",
      pitch: pitchOf("G4"),
    });
  });
});

describe("keys", () => {
  it("goes round the circle of fifths, majors before their minors", () => {
    expect(KEY_ORDER.slice(0, 5)).toEqual([
      "keys:0:major",
      "keys:1:major",
      "keys:-1:major",
      "keys:2:major",
      "keys:-2:major",
    ]);
    expect(KEY_ORDER[5]).toBe("keys:0:minor");
    expect(KEY_ORDER).toHaveLength(30);
    expect(new Set(KEY_ORDER).size).toBe(30);
  });

  it("offers the right key among its usual mix-ups", () => {
    const options = keyOptions(2, () => 0.5);
    expect(options.sort((a, b) => a - b)).toEqual([-2, 1, 2, 3]);
    expect(keyOptions(7).sort((a, b) => a - b)).toEqual([-7, 5, 6, 7]);
    expect(keyOptions(0).sort((a, b) => a - b)).toEqual([-1, 0, 1, 2]);
    const question = questionFor("keys:-3:minor", "bass");
    expect(question).toMatchObject({
      kind: "keys",
      fifths: -3,
      mode: "minor",
      clef: "bass",
    });
  });
});

describe("playing", () => {
  it("expects the sounding note of a transposing instrument", () => {
    const position = staffPosition("treble", pitchOf("C5"));
    expect(
      questionFor(`play:clarinet:treble:${position}`, "treble"),
    ).toMatchObject({ kind: "play", midi: midiOf(pitchOf("C5")) - 2 });
    expect(questionFor(`play:doubleBass:bass:0`, "bass")).toMatchObject({
      midi: midiOf(pitchOf("G2")) - 12,
    });
    expect(questionFor("nonsense", "treble")).toBeNull();
    expect(kindOf("play:violin:treble:2")).toBe("play");
  });
});

describe("interleave", () => {
  it("takes from each drill in turn", () => {
    expect(interleave(["a1", "a2", "a3"], ["b1"])).toEqual([
      "a1",
      "b1",
      "a2",
      "a3",
    ]);
  });
});

describe("intervals", () => {
  it("comes in from the most distinct, melodic before harmonic", () => {
    expect(EAR_ORDER.slice(0, 3)).toEqual([
      "ear:12:melodic",
      "ear:7:melodic",
      "ear:4:melodic",
    ]);
    expect(EAR_ORDER[6]).toBe("ear:12:harmonic");
    expect(EAR_ORDER.at(-1)).toBe("ear:6:harmonic");
    expect(new Set(EAR_ORDER).size).toBe(24);
  });

  it("offers only intervals learnt so far, nearest in size", () => {
    expect(intervalOptions(12)).toEqual([7, 12]);
    expect(intervalOptions(4)).toEqual([4, 7, 12]);
    expect(intervalOptions(6)).toEqual([4, 5, 6, 7]);
  });

  it("spells the upper note as the interval", () => {
    const fifth = questionFor("ear:7:harmonic", "treble", () => 0);
    expect(fifth).toMatchObject({
      kind: "ear",
      harmonic: true,
      low: pitchOf("E4"),
      high: { step: 6, alter: 0, octave: 4 },
    });
    // From E a minor sixth is C, not B♯.
    expect(questionFor("ear:8:melodic", "treble", () => 0)).toMatchObject({
      high: { step: 0, alter: 0, octave: 5 },
    });
    // From E a major third is G♯; the tritone is spelt as a fourth (F–B), not a fifth.
    expect(questionFor("ear:4:melodic", "treble", () => 0)).toMatchObject({
      high: { step: 4, alter: 1, octave: 4 },
    });
    expect(questionFor("ear:6:melodic", "treble", () => 0.2)).toMatchObject({
      low: pitchOf("F4"),
      high: { step: 6, alter: 0, octave: 4 },
    });
    // The bass clef's lower staff: B2 up a minor third is D3.
    expect(questionFor("ear:3:melodic", "bass", () => 0.4)).toMatchObject({
      low: pitchOf("B2"),
      high: { step: 1, alter: 0, octave: 3 },
    });
  });
});

describe("transposing", () => {
  it("asks first what sounds, then parts in the family’s other keys", () => {
    const trumpet = transOrder("trumpet");
    expect(trumpet[0]).toBe("trans:trumpet:concert:2");
    expect(trumpet[9]).toBe("trans:trumpet:+0:2");
    expect(trumpet[18]).toBe("trans:trumpet:+2:2");
    expect(transOrder("violin")).toEqual([]);
    // A double bass sounds an octave lower: the same note, nothing to transpose.
    expect(transOrder("doubleBass")).toEqual([]);
  });

  it("works out the note that sounds and the note to play", () => {
    const c5 = staffPosition("treble", pitchOf("C5"));
    // A B♭ trumpet's written C sounds B♭, a whole tone lower.
    expect(questionFor(`trans:trumpet:concert:${c5}`, "treble")).toMatchObject({
      answer: 10,
      shift: -2,
      part: null,
    });
    // A horn in F sounds a fifth lower: written C is F.
    expect(questionFor(`trans:horn:concert:${c5}`, "treble")).toMatchObject({
      answer: 5,
      shift: -7,
    });
    // A trumpet part in D on a B♭ trumpet: read a major third higher, C → E.
    expect(questionFor(`trans:trumpet:+2:${c5}`, "treble")).toMatchObject({
      answer: 4,
      shift: 4,
      part: { step: 1, alter: 0, semitones: 2 },
    });
    // A horn part in E♭ on an F horn: a whole tone lower, C → B♭.
    expect(questionFor(`trans:horn:-9:${c5}`, "treble")).toMatchObject({
      answer: 10,
      shift: -2,
    });
    // A C part on an alto saxophone: a minor third lower, C → A.
    expect(questionFor(`trans:altoSax:+0:${c5}`, "treble")).toMatchObject({
      answer: 9,
      shift: -3,
    });
    expect(questionFor(`trans:trumpet:+7:${c5}`, "treble")).toBeNull();
    expect(kindOf("trans:horn:-9:4")).toBe("trans");
  });
});

describe("rhythm", () => {
  it("asks every pattern as a bar to tap", () => {
    for (const id of RHYTHM_ORDER)
      expect(questionFor(id, "treble")).toMatchObject({ kind: "rhythm", id });
    expect(questionFor("rhythm:4-4-r4-4", "bass")).toMatchObject({
      pattern: "4 4 r4 4",
      events: [{ at: 0 }, { at: 4 }, { at: 8, rest: true }, { at: 12 }],
    });
    expect(questionFor("rhythm:4-4", "treble")).toBeNull();
  });
});

describe("scales", () => {
  it("asks a scale with its clef and notes", () => {
    expect(questionFor("scale:cello:0:major", "treble")).toMatchObject({
      kind: "scale",
      clef: "bass",
      item: { fifths: 0, type: "major" },
    });
    expect(questionFor("scale:timpani:0:major", "bass")).toBeNull();
  });

  it("asks a scale over more octaves", () => {
    expect(questionFor("scale:violin:1:major:2", "treble")).toMatchObject({
      kind: "scale",
      item: { octaves: 2 },
    });
  });
});

describe("chords", () => {
  const spelt = (id: string, random: () => number) => {
    const q = questionFor(id, "treble", random);
    if (q?.kind !== "chord") throw new Error(id);
    return q;
  };

  it("stacks the quality as thirds on a natural root", () => {
    for (const [id, shape] of [
      ["chord:major", [4, 7]],
      ["chord:minor", [3, 7]],
      ["chord:diminished", [3, 6]],
      ["chord:augmented", [4, 8]],
    ] as const) {
      for (const at of [0, 0.3, 0.6, 0.9]) {
        const { pitches } = spelt(id, () => at);
        expect(pitches[0].alter).toBe(0);
        expect(
          pitches.map((pitch) => midiOf(pitch) - midiOf(pitches[0])),
        ).toEqual([0, ...shape]);
        expect(
          pitches.map(
            (pitch) =>
              staffPosition("treble", pitch) -
              staffPosition("treble", pitches[0]),
          ),
        ).toEqual([0, 2, 4]);
      }
    }
  });

  it("offers the qualities heard so far, major and minor at least", () => {
    expect(spelt("chord:major", Math.random).options).toEqual([
      "major",
      "minor",
    ]);
    expect(spelt("chord:augmented", Math.random).options).toEqual([
      "major",
      "minor",
      "diminished",
      "augmented",
    ]);
    expect(questionFor("chord:sus4", "treble")).toBeNull();
  });

  it("comes in among the intervals, the hard ones last", () => {
    expect(EAR_DECK).toHaveLength(EAR_ORDER.length + CHORD_ORDER.length);
    expect(EAR_DECK.indexOf("chord:major")).toBe(12);
    expect(EAR_DECK.slice(-2)).toEqual(["chord:diminished", "chord:augmented"]);
  });
});
