import { describe, it, expect } from "vitest";
import { meetingTimeOf, permitProgress, previewTrack, tripPipeline, nextStep, trackFor } from "./pipeline";

const keys = (kind: string, state: any) =>
  tripPipeline(kind, state).stages.map((s) => `${s.key}:${s.state}`);

describe("the trip pipeline", () => {
  it("starts a new group on the first step, with nothing done", () => {
    const { stages, currentKey } = tripPipeline("trek", { groupStatus: "forming" });
    expect(currentKey).toBe("forming");
    expect(stages[0].state).toBe("current");
    expect(stages.every((s, i) => i === 0 || s.state === "upcoming")).toBe(true);
  });

  it("ticks the deposit the moment it is paid, and moves to the papers", () => {
    // This asserted `deposit:current` on a booking whose status IS
    // `deposit_paid`, which drew an open circle over money already taken and
    // left the tick a step behind the truth for the rest of the trip. A step
    // sits at the first status where its work STARTS, not the status named
    // after it having finished.
    expect(keys("trek", { groupStatus: "booked", bookingStatus: "deposit_paid" })).toEqual([
      "forming:done",
      "ready:done",
      "deposit:done",
      "papers:current",
      "permits:upcoming",
      "active:upcoming",
      "done:upcoming",
    ]);
  });

  it("asks for the deposit while it is the thing outstanding", () => {
    expect(keys("trek", { groupStatus: "booked", bookingStatus: "pending_deposit" })).toEqual([
      "forming:done",
      "ready:done",
      "deposit:current",
      "papers:upcoming",
      "permits:upcoming",
      "active:upcoming",
      "done:upcoming",
    ]);
  });

  it("keeps the papers current while they are being collected", () => {
    expect(keys("trek", { bookingStatus: "docs_pending" })).toEqual([
      "forming:done",
      "ready:done",
      "deposit:done",
      "papers:current",
      "permits:upcoming",
      "active:upcoming",
      "done:upcoming",
    ]);
  });

  it("moves to the permits once the booking is confirmed", () => {
    expect(keys("trek", { bookingStatus: "confirmed" })).toEqual([
      "forming:done",
      "ready:done",
      "deposit:done",
      "papers:done",
      "permits:current",
      "active:upcoming",
      "done:upcoming",
    ]);
  });

  it("gives a trek permits and papers, and a food tour neither", () => {
    expect(trackFor("trek").map((s) => s.key)).toContain("permits");
    expect(trackFor("food_culture").map((s) => s.key)).not.toContain("permits");
    expect(trackFor("food_culture").map((s) => s.key)).not.toContain("papers");
  });

  it("reads a papers-stage booking on a track that has no papers stage", () => {
    // A day hike collects no passports, so `docs_pending` on one of them just
    // means paid and not yet confirmed — the money is in and the thing still
    // outstanding is where to meet.
    expect(keys("day_hike", { bookingStatus: "docs_pending" })).toEqual([
      "forming:done",
      "ready:done",
      "deposit:done",
      "confirmed:current",
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

describe("permitProgress", () => {
  it("is nothing at all when no permit has been raised", () => {
    expect(permitProgress([])).toBe("none");
    expect(permitProgress(null)).toBe("none");
    expect(permitProgress(undefined)).toBe("none");
  });

  it("is issued only when every one of them is", () => {
    // A trek carries several — park entry, municipality fee, TIMS — and one
    // still at the office means the trip is not cleared.
    expect(permitProgress([{ status: "ready" }, { status: "ready" }])).toBe("issued");
    expect(permitProgress([{ status: "ready" }, { status: "filed" }])).toBe("filed");
  });

  it("lets the worst news win", () => {
    expect(permitProgress([{ status: "ready" }, { status: "rejected" }])).toBe("problem");
  });

  it("separates filed from not yet started", () => {
    expect(permitProgress([{ status: "filed" }])).toBe("filed");
    expect(permitProgress([{ status: "approved" }])).toBe("filed");
    expect(permitProgress([{ status: "awaiting_docs" }])).toBe("waiting");
  });
});

describe("the permits step reads the permits, not the booking", () => {
  const stageOf = (stages: any[], key: string) => stages.find((s) => s.key === key);

  it("ticks once the office has them, without waiting for departure", () => {
    // The bug: a booking sits at `confirmed` from the day the papers land
    // until the day the trek starts, so this step stayed an open circle for
    // weeks after the permits were issued and in the office.
    const { stages } = tripPipeline("trek", {
      bookingStatus: "confirmed",
      permits: "issued",
    });
    expect(stageOf(stages, "permits").state).toBe("done");
  });

  it("says who collects them, because otherwise people ask", () => {
    const { stages } = tripPipeline("trek", {
      bookingStatus: "confirmed",
      permits: "issued",
      guideName: "Pemba",
    });
    expect(stageOf(stages, "permits").hint).toContain("Pemba collects them");
    expect(stageOf(stages, "permits").hint).toContain("office");
  });

  it("still names a collector when we have no guide name", () => {
    const { stages } = tripPipeline("trek", { bookingStatus: "confirmed", permits: "issued" });
    expect(stageOf(stages, "permits").hint).toContain("Your guide collects them");
  });

  it("keeps the step open while they are still with the permit office", () => {
    const { stages } = tripPipeline("trek", { bookingStatus: "confirmed", permits: "filed" });
    expect(stageOf(stages, "permits").state).toBe("current");
    expect(stageOf(stages, "permits").hint).toContain("waiting on the permit office");
  });

  it("does not pretend a rejected permit is fine", () => {
    const { stages } = tripPipeline("trek", { bookingStatus: "confirmed", permits: "problem" });
    expect(stageOf(stages, "permits").state).toBe("current");
    expect(stageOf(stages, "permits").hint).toContain("came back");
  });

  it("behaves exactly as before when nobody tells it about permits", () => {
    const { stages, currentKey } = tripPipeline("trek", { bookingStatus: "confirmed" });
    expect(stageOf(stages, "permits").state).toBe("current");
    expect(currentKey).toBe("permits");
    expect(stageOf(stages, "permits").hint).toContain("TIMS");
  });

  it("moves the trip on to the next step rather than leaving it with none", () => {
    // A track with nothing marked current reads as finished, which it is not.
    const { stages, currentKey } = tripPipeline("trek", {
      bookingStatus: "confirmed",
      permits: "issued",
    });
    expect(currentKey).toBe("active");
    expect(stageOf(stages, "active").state).toBe("current");
  });

  it("does not claim they are walking before they are", () => {
    const { stages } = tripPipeline("trek", { bookingStatus: "confirmed", permits: "issued" });
    expect(stageOf(stages, "active").hint).not.toContain("Walking");
    expect(stageOf(stages, "active").hint).toContain("Nothing left to do");
  });

  it("says walking once they actually are", () => {
    const { stages } = tripPipeline("trek", { bookingStatus: "active", permits: "issued" });
    expect(stageOf(stages, "active").state).toBe("current");
    expect(stageOf(stages, "active").hint).toContain("Walking");
  });

  it("leaves a day hike alone — it has no permits step to move", () => {
    const { stages, currentKey } = tripPipeline("day_hike", {
      bookingStatus: "confirmed",
      permits: "issued",
    });
    expect(stages.some((s) => s.key === "permits")).toBe(false);
    expect(currentKey).toBe("confirmed");
  });

  it("does not resurrect a cancelled trip", () => {
    const { stages, stopped } = tripPipeline("trek", {
      bookingStatus: "cancelled_trekker",
      permits: "issued",
    });
    expect(stopped).toBe(true);
    expect(stageOf(stages, "permits").state).toBe("stopped");
  });

  it("leaves a finished trip every step done", () => {
    const { stages, currentKey } = tripPipeline("trek", {
      bookingStatus: "completed",
      permits: "issued",
    });
    expect(stages.every((s) => s.state === "done")).toBe(true);
    expect(currentKey).toBeNull();
  });
});

describe("a ticked permits step still answers the question it raises", () => {
  it("keeps explaining itself once it is done", () => {
    // "Permits filed ✓" makes a trekker wonder whether they have to go and
    // collect something. The answer belongs on that line, not on the step
    // after it.
    const { stages } = tripPipeline("trek", {
      bookingStatus: "confirmed",
      permits: "issued",
      guideName: "Pemba",
    });
    const permits = stages.find((s) => s.key === "permits")!;
    expect(permits.state).toBe("done");
    expect(permits.emphasis).toBe(true);
  });

  it("does not shout on steps that are merely done", () => {
    const { stages } = tripPipeline("trek", {
      bookingStatus: "confirmed",
      permits: "issued",
    });
    expect(stages.find((s) => s.key === "papers")!.emphasis).toBeFalsy();
    expect(stages.find((s) => s.key === "deposit")!.emphasis).toBeFalsy();
  });

  it("stays quiet on a trip that was called off", () => {
    const { stages } = tripPipeline("trek", {
      bookingStatus: "cancelled_trekker",
      permits: "issued",
    });
    expect(stages.find((s) => s.key === "permits")!.emphasis).toBeFalsy();
  });
});

describe("where to meet is an address, not a chore", () => {
  const stageOf = (stages: any[], key: string) => stages.find((s) => s.key === key);
  const momo = {
    bookingStatus: "confirmed",
    meetingPoint: "Thamel",
    startsOn: "23 Sep, 2026",
    meetingTime: "18:00",
    guideName: "Pemba",
  };

  it("ticks once the address is settled, which is at the moment of booking", () => {
    // It sat as an open circle with no button under it, so it read as
    // something the trekker had failed to do — when in fact the address was
    // agreed when they paid.
    const { stages } = tripPipeline("food_culture", momo);
    expect(stageOf(stages, "confirmed").state).toBe("done");
  });

  it("says the place, the day and the hour on the step itself", () => {
    const hint = stageOf(tripPipeline("food_culture", momo).stages, "confirmed").hint;
    expect(hint).toContain("Thamel");
    expect(hint).toContain("23 Sep, 2026");
    expect(hint).toContain("18:00");
    expect(hint).toContain("Pemba");
  });

  it("keeps explaining itself after it is ticked", () => {
    expect(stageOf(tripPipeline("food_culture", momo).stages, "confirmed").emphasis).toBe(true);
  });

  it("copes with a place but no time", () => {
    const hint = stageOf(
      tripPipeline("day_hike", { bookingStatus: "confirmed", meetingPoint: "Kande" }).stages,
      "confirmed",
    ).hint;
    expect(hint).toContain("Kande");
    expect(hint).not.toContain("undefined");
  });

  it("stays open, and says who it is waiting on, when there is no address yet", () => {
    const stage = stageOf(
      tripPipeline("food_culture", { bookingStatus: "confirmed" }).stages,
      "confirmed",
    );
    expect(stage.state).toBe("current");
    expect(stage.hint).toContain("Your guide sends the address");
  });

  it("moves the trip on to the day itself rather than leaving nothing current", () => {
    const { currentKey, stages } = tripPipeline("food_culture", momo);
    expect(currentKey).toBe("active");
    expect(stageOf(stages, "active").hint).toContain("23 Sep, 2026");
    expect(stageOf(stages, "active").hint).not.toContain("Happening today");
  });

  it("does not tick it before the trip is even paid for", () => {
    // A meeting point on the listing is not a confirmed booking.
    const { stages } = tripPipeline("food_culture", {
      bookingStatus: "pending_deposit",
      meetingPoint: "Thamel",
    });
    expect(stageOf(stages, "confirmed").state).toBe("upcoming");
  });

  it("works the same for a group trip", () => {
    const { stages } = tripPipeline("food_culture", {
      groupStatus: "booked",
      bookingStatus: "confirmed",
      meetingPoint: "Thamel",
      startsOn: "23 Sep, 2026",
    });
    expect(stageOf(stages, "confirmed").state).toBe("done");
    expect(stageOf(stages, "confirmed").hint).toContain("Thamel");
  });

  it("settles the permits and the meeting point together on a trek", () => {
    const { stages, currentKey } = tripPipeline("trek", {
      bookingStatus: "confirmed",
      permits: "issued",
      guideName: "Pemba",
    });
    expect(stages.find((s) => s.key === "permits")!.state).toBe("done");
    expect(currentKey).toBe("active");
  });

  it("leaves a cancelled trip alone", () => {
    const { stages } = tripPipeline("food_culture", {
      bookingStatus: "cancelled_trekker",
      meetingPoint: "Thamel",
    });
    expect(stages.find((s) => s.key === "confirmed")!.state).toBe("stopped");
  });
});

describe("meetingTimeOf", () => {
  it("takes the hour out of a day trip's own itinerary", () => {
    expect(meetingTimeOf([{ time: "18:00", title: "Meet in Thamel" }])).toBe("18:00");
  });

  it("takes the first time when there are several", () => {
    expect(meetingTimeOf([{ time: "09:00" }, { time: "13:00" }])).toBe("09:00");
  });

  it("skips a step with no time rather than stopping at it", () => {
    expect(meetingTimeOf([{ title: "Briefing" }, { time: "07:30" }])).toBe("07:30");
  });

  it("is nothing for a trek, whose itinerary is days rather than hours", () => {
    expect(meetingTimeOf([{ day: 1, title: "Fly to Lukla" }])).toBeNull();
  });

  it("survives anything that is not an itinerary", () => {
    expect(meetingTimeOf(null)).toBeNull();
    expect(meetingTimeOf("18:00")).toBeNull();
    expect(meetingTimeOf([{ time: "   " }])).toBeNull();
  });
});
