import { describe, expect, it } from "vitest";
import { askNotice, dateWords, timeLeft, type StandingAsk } from "./standing-ask";

const now = new Date("2026-09-15T12:00:00Z");
const ask = (over: Partial<StandingAsk>): StandingAsk => ({
  status: "open",
  startDate: "2026-11-30",
  expiresAt: "2026-09-16T12:00:00Z",
  ...over,
});

describe("waiting on an answer", () => {
  it("says it was sent, and how long is left", () => {
    const n = askNotice(ask({}), null, "Pemba", now);
    expect(n.state).toBe("waiting");
    expect(n.text).toContain("Request sent to Pemba");
    expect(n.text).toContain("About 24 hours");
    expect(n.canAskAgain).toBe(false);
  });

  it("still says it was sent when the clock has run out but nothing swept it", () => {
    // "They have until yesterday to reply" is worse than saying nothing.
    const n = askNotice(ask({ expiresAt: "2026-09-14T12:00:00Z" }), null, "Pemba", now);
    expect(n.state).toBe("waiting");
    expect(n.text).toContain("Request sent to Pemba");
    expect(n.text).not.toMatch(/-?\d+ hours/);
  });

  it("treats a quote the same as an open ask — both are waiting on them", () => {
    expect(askNotice(ask({ status: "quoted" }), null, "Pemba", now).state).toBe("waiting");
  });
});

describe("a booking beats everything", () => {
  it("reports the booking, not the request behind it", () => {
    const n = askNotice(ask({}), "confirmed", "Pemba", now);
    expect(n.state).toBe("booked");
    expect(n.text).toContain("already have this booked");
  });

  it("does not count a cancelled booking as a booking", () => {
    const n = askNotice(ask({ status: "declined" }), "cancelled_guide", "Pemba", now);
    expect(n.state).toBe("declined");
  });
});

describe("after the trip was cancelled", () => {
  /**
   * The founder's screenshot: a cancelled Langtang trip still reading
   * "pratik said yes. Finish it in My trips."
   *
   * Nothing walks an enquiry's status back when its booking is cancelled, so
   * it stays `accepted` forever — and in production every single accepted
   * enquiry was sitting behind a cancelled booking.
   */
  for (const bookingStatus of ["cancelled_trekker", "cancelled_guide", "cancelled_force_majeure"]) {
    it(`does not say "said yes" about a trip that is ${bookingStatus}`, () => {
      const n = askNotice(ask({ status: "accepted" }), bookingStatus, "pratik", now);
      expect(n.state).toBe("cancelled");
      expect(n.text).not.toContain("said yes");
      expect(n.text).toContain("was cancelled");
    });
  }

  it("does the same for a converted request, which is the commoner case", () => {
    // Converted means money moved, so there is definitely a booking behind it.
    expect(askNotice(ask({ status: "converted" }), "cancelled_trekker", "pratik", now).state).toBe(
      "cancelled",
    );
  });

  it("lets them ask again, which the server has always allowed", () => {
    // enquiry.tsx excludes cancelled bookings from its duplicate check, so the
    // banner was the only thing standing in the way.
    const n = askNotice(ask({ status: "accepted" }), "cancelled_trekker", "pratik", now);
    expect(n.canAskAgain).toBe(true);
    expect(n.offerOtherDates).toBe(true);
  });

  it("does not offer other guides — this one never said no", () => {
    const n = askNotice(ask({ status: "accepted" }), "cancelled_trekker", "pratik", now);
    expect(n.offerOtherGuides).toBe(false);
  });

  it("still says yes when the booking is alive", () => {
    expect(askNotice(ask({ status: "accepted" }), null, "pratik", now).state).toBe("accepted");
    // A live booking is answered earlier still, as "booked".
    expect(askNotice(ask({ status: "accepted" }), "confirmed", "pratik", now).state).toBe("booked");
  });

  it("a later decline is newer news than the cancellation behind it", () => {
    // Booked, cancelled, asked again, turned down. The no is what matters.
    expect(askNotice(ask({ status: "declined" }), "cancelled_trekker", "pratik", now).state).toBe(
      "declined",
    );
  });
});

describe("after the guide says no", () => {
  const n = askNotice(ask({ status: "declined" }), null, "Pemba", now);

  it("names the guide and the dates rather than failing silently", () => {
    expect(n.state).toBe("declined");
    expect(n.text).toContain("Pemba");
    expect(n.text).toContain("30 November");
  });

  it("says can't, not won't — they are usually already on a mountain", () => {
    expect(n.text).toMatch(/can't take/);
    expect(n.text).not.toMatch(/rejected|refused|denied/i);
  });

  it("keeps the guide first and offers other dates before other guides", () => {
    expect(n.offerOtherDates).toBe(true);
    expect(n.offerOtherGuides).toBe(true);
    expect(n.canAskAgain).toBe(true);
  });

  it("invents no reason, because none is stored", () => {
    expect(n.text).not.toMatch(/because|reason/i);
  });
});

describe("after nobody answered", () => {
  const n = askNotice(ask({ status: "expired" }), null, "Pemba", now);

  it("says the dates are free again and offers another go", () => {
    expect(n.state).toBe("expired");
    expect(n.text).toContain("30 November");
    expect(n.text).toMatch(/free again/);
    expect(n.canAskAgain).toBe(true);
  });
});

describe("nothing to say", () => {
  it("says nothing when there has never been a request", () => {
    const n = askNotice(null, null, "Pemba", now);
    expect(n.state).toBe("none");
    expect(n.text).toBe("");
    expect(n.canAskAgain).toBe(true);
  });

  it("says nothing when the trekker withdrew it themselves", () => {
    // They cancelled it. They know. A notice would be the site explaining
    // their own action back to them.
    expect(askNotice(ask({ status: "withdrawn" }), null, "Pemba", now).state).toBe("none");
  });

  it("copes with a guide whose name we somehow do not have", () => {
    expect(askNotice(ask({}), null, "", now).text).toContain("your guide");
  });
});

describe("the guide has already agreed", () => {
  it("points at My trips rather than the booking form", () => {
    const n = askNotice(ask({ status: "accepted" }), null, "Pemba", now);
    expect(n.state).toBe("accepted");
    expect(n.text).toContain("said yes");
  });
});

describe("timeLeft", () => {
  it("counts in the unit a person would use", () => {
    expect(timeLeft("2026-09-15T13:00:00Z", now)).toBe("About 60 minutes");
    expect(timeLeft("2026-09-16T12:00:00Z", now)).toBe("About 24 hours");
    expect(timeLeft("2026-09-19T12:00:00Z", now)).toBe("About 4 days");
  });

  it("is null once it has run out, or when there is no clock", () => {
    expect(timeLeft("2026-09-15T11:00:00Z", now)).toBeNull();
    expect(timeLeft(null, now)).toBeNull();
    expect(timeLeft("not-a-date", now)).toBeNull();
  });
});

describe("dateWords", () => {
  it("says the date the way a person would", () => {
    expect(dateWords("2026-11-30")).toBe("30 November");
  });

  it("degrades to something readable rather than Invalid Date", () => {
    expect(dateWords(null)).toBe("those dates");
    expect(dateWords("nonsense")).toBe("those dates");
  });
});
