import { describe, it, expect } from "vitest";
import {
  SETUP_STEPS,
  factsFrom,
  setupProgress,
  stepAfter,
  stepBefore,
  stepDone,
  type SetupFacts,
} from "./guide-setup";

const EMPTY: SetupFacts = {
  hasPhoto: false,
  promise: null,
  hook: null,
  bio: null,
  regions: 0,
  routes: 0,
  languages: 0,
  dayRateCents: null,
  payoutAccount: null,
  offerings: 0,
};

const FULL: SetupFacts = {
  hasPhoto: true,
  promise: "You sleep at my family house in Ghandruk.",
  hook: "Knows every teahouse from Lukla to Gorak Shep",
  bio: null,
  regions: 2,
  routes: 3,
  languages: 2,
  dayRateCents: 4000,
  payoutAccount: "9841000000",
  offerings: 1,
};

describe("the six steps add up to a hundred", () => {
  it("exactly", () => {
    expect(SETUP_STEPS.reduce((n, s) => n + s.points, 0)).toBe(100);
  });
  it("a blank page is 0%, a finished one is 100%", () => {
    expect(setupProgress(EMPTY).percent).toBe(0);
    expect(setupProgress(EMPTY).next).toBe("photo");
    expect(setupProgress(FULL).percent).toBe(100);
    expect(setupProgress(FULL).complete).toBe(true);
    expect(setupProgress(FULL).next).toBeNull();
  });
  it("a photo and a trip are most of the way there", () => {
    const p = setupProgress({ ...EMPTY, hasPhoto: true, offerings: 1 });
    expect(p.percent).toBe(40);
    expect(p.next).toBe("words");
  });
});

describe("what counts as done", () => {
  it("words need the promise and something under the name", () => {
    expect(stepDone("words", { ...EMPTY, promise: "One thing." })).toBe(false);
    expect(stepDone("words", { ...EMPTY, promise: "One thing.", bio: "I grew up…" })).toBe(true);
    expect(stepDone("words", { ...EMPTY, hook: "Line", bio: "Story" })).toBe(false);
  });
  it("where needs an area and a route walked", () => {
    expect(stepDone("where", { ...EMPTY, regions: 1 })).toBe(false);
    expect(stepDone("where", { ...EMPTY, regions: 1, routes: 1 })).toBe(true);
  });
  it("rate needs a number and somewhere to send it", () => {
    expect(stepDone("rate", { ...EMPTY, dayRateCents: 4000 })).toBe(false);
    expect(stepDone("rate", { ...EMPTY, dayRateCents: 4000, payoutAccount: " " })).toBe(false);
    expect(stepDone("rate", { ...EMPTY, dayRateCents: 4000, payoutAccount: "984" })).toBe(true);
  });
  it("a headshot counts as a photo even before the avatar is synced", () => {
    const f = factsFrom({
      guide: null,
      avatarUrl: null,
      photos: [{ kind: "headshot" }],
      languages: [],
      walked: [],
      offeringCount: 0,
    });
    expect(f.hasPhoto).toBe(true);
  });
});

describe("where Continue goes", () => {
  it("to the next unfinished step", () => {
    expect(stepAfter("photo", { ...EMPTY, hasPhoto: true })).toBe("words");
  });
  it("skips finished steps", () => {
    expect(stepAfter("words", { ...FULL, regions: 0, offerings: 0 })).toBe("where");
    expect(stepAfter("where", { ...FULL, offerings: 0 })).toBe("trip");
  });
  it("comes back round to an earlier step that was skipped", () => {
    expect(stepAfter("trip", { ...FULL, hasPhoto: false })).toBe("photo");
  });
  it("is nowhere when everything is done", () => {
    expect(stepAfter("rate", FULL)).toBeNull();
  });
  it("back is simply the previous step", () => {
    expect(stepBefore("photo")).toBeNull();
    expect(stepBefore("words")).toBe("photo");
    expect(stepBefore("trip")).toBe("rate");
  });
});
