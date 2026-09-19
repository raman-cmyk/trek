import { describe, it, expect } from "vitest";
import { tripPipeline, nextStep, trackFor } from "./pipeline";

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

  it("never labels a pending deposit as paid", () => {
    const { stages, currentKey } = tripPipeline("food_culture", {
      bookingStatus: "pending_deposit",
    });
    expect(currentKey).toBe("ready");
    expect(stages.find((s) => s.key === "ready")?.state).toBe("current");
    expect(stages.find((s) => s.key === "deposit")?.state).toBe("upcoming");
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

describe("the meeting step completes itself", () => {
  const momo = { kind: "food_culture", bookingStatus: "confirmed" };

  it("sits on the trekker as the current step while the address is unknown", () => {
    const { stages, currentKey } = tripPipeline(momo.kind, {
      bookingStatus: momo.bookingStatus,
      meetingSettled: false,
    });
    expect(currentKey).toBe("confirmed");
    expect(stages.find((s) => s.key === "confirmed")!.state).toBe("current");
  });

  it("is done once the place and the time are known", () => {
    const { stages, currentKey } = tripPipeline(momo.kind, {
      bookingStatus: momo.bookingStatus,
      meetingSettled: true,
    });
    expect(stages.find((s) => s.key === "confirmed")!.state).toBe("done");
    // What is left is the day itself, which nobody has to do anything about.
    expect(stages.find((s) => s.key === "active")!.state).toBe("waiting");
    expect(currentKey).toBe("active");
    expect(stages.find((s) => s.key === "done")!.state).toBe("upcoming");
  });

  it("does not tick a step the trip has not reached yet", () => {
    const { stages } = tripPipeline(momo.kind, {
      bookingStatus: "deposit_paid",
      meetingSettled: true,
    });
    expect(stages.find((s) => s.key === "deposit")!.state).toBe("current");
    expect(stages.find((s) => s.key === "confirmed")!.state).toBe("upcoming");
  });

  it("leaves a trek's permit step alone — it is not the meeting step", () => {
    const { stages, currentKey } = tripPipeline("trek", {
      bookingStatus: "confirmed",
      meetingSettled: true,
    });
    expect(stages.find((s) => s.key === "permits")!.state).toBe("current");
    expect(currentKey).toBe("permits");
  });

  it("a trip out walking has its meeting step behind it either way", () => {
    for (const settled of [true, false]) {
      const { stages } = tripPipeline("city", {
        bookingStatus: "active",
        meetingSettled: settled,
      });
      expect(stages.find((s) => s.key === "confirmed")!.state).toBe("done");
      expect(stages.find((s) => s.key === "active")!.state).toBe("current");
    }
  });

  it("a cancelled trip does not tick anything on the strength of an address", () => {
    const { stages, stopped } = tripPipeline("food_culture", {
      bookingStatus: "cancelled_trekker",
      meetingSettled: true,
    });
    expect(stopped).toBe(true);
    expect(stages.some((s) => s.state === "waiting")).toBe(false);
  });

  it("nextStep names the day once the address is in", () => {
    expect(nextStep("food_culture", { bookingStatus: "confirmed", meetingSettled: true })?.label)
      .toBe("Out with your guide");
    expect(nextStep("food_culture", { bookingStatus: "confirmed", meetingSettled: false })?.label)
      .toBe("Where to meet");
  });
});
