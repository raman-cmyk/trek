import { describe, it, expect } from "vitest";
import { previewTrack, tripPipeline, nextStep, trackFor } from "./pipeline";

const keys = (kind: string, state: any) =>
  tripPipeline(kind, state).stages.map((s) => `${s.key}:${s.state}`);

describe("the trip pipeline", () => {
  it("starts a new group on the first step, with nothing done", () => {
    const { stages, currentKey } = tripPipeline("trek", { groupStatus: "forming" });
    expect(currentKey).toBe("forming");
    expect(stages[0].state).toBe("current");
    expect(stages.every((s, i) => i === 0 || s.state === "upcoming")).toBe(true);
  });

  it("moves with the booking, not ahead of it", () => {
    expect(keys("trek", { groupStatus: "booked", bookingStatus: "deposit_paid" })).toEqual([
      "forming:done",
      "ready:done",
      "deposit:current",
      "papers:upcoming",
      "permits:upcoming",
      "active:upcoming",
      "done:upcoming",
    ]);
  });

  it("gives a trek permits and papers, and a food tour neither", () => {
    expect(trackFor("trek").map((s) => s.key)).toContain("permits");
    expect(trackFor("food_culture").map((s) => s.key)).not.toContain("permits");
    expect(trackFor("food_culture").map((s) => s.key)).not.toContain("papers");
  });

  it("reads a papers-stage booking as 'paid' on a track that has no papers stage", () => {
    // A day hike never files permits, so docs_pending must not fall off the
    // end of its shorter track.
    expect(keys("day_hike", { bookingStatus: "docs_pending" })).toEqual([
      "forming:done",
      "ready:done",
      "deposit:current",
      "confirmed:upcoming",
      "active:upcoming",
      "done:upcoming",
    ]);
  });

  it("leaves a finished trip with no pulsing 'current' step", () => {
    const { stages, currentKey } = tripPipeline("trek", { bookingStatus: "completed" });
    expect(currentKey).toBeNull();
    expect(stages.every((s) => s.state === "done")).toBe(true);
  });

  it("stops a cancelled trip instead of pretending the rest is coming", () => {
    const { stopped, currentKey } = tripPipeline("trek", {
      groupStatus: "booked",
      bookingStatus: "cancelled_trekker",
    });
    expect(stopped).toBe(true);
    expect(currentKey).toBeNull();
    expect(nextStep("trek", { bookingStatus: "cancelled_trekker" })).toBeNull();
  });

  it("falls back to the trek track for an unknown kind", () => {
    expect(trackFor("something_new").map((s) => s.key)).toEqual(
      trackFor("trek").map((s) => s.key),
    );
  });

  it("names the next thing that has to happen", () => {
    expect(nextStep("trek", { bookingStatus: "docs_pending" })?.label).toBe(
      "Passports & insurance",
    );
  });
});

describe("previewTrack", () => {
  it("is what happens after you book, not before", () => {
    const keys = previewTrack("trek").map((s) => s.key);
    expect(keys).not.toContain("forming");
    expect(keys[0]).toBe("deposit");
  });

  it("differs by experience, which is the whole point", () => {
    const trek = previewTrack("trek").map((s) => s.key);
    const food = previewTrack("food_culture").map((s) => s.key);
    expect(trek).toContain("papers");
    expect(trek).toContain("permits");
    expect(food).not.toContain("permits");
    expect(food.length).toBeLessThan(trek.length);
  });

  it("falls back to the trek track for an unknown kind", () => {
    expect(previewTrack("spelunking")).toEqual(previewTrack("trek"));
  });

  it("carries a hint on every step — a label alone explains nothing", () => {
    for (const s of previewTrack("day_hike")) expect(s.hint.length).toBeGreaterThan(0);
  });
});
