import { describe, expect, it } from "vitest";
import { askOutcome, isCancelledBooking, isUniqueViolation } from "./ask-guard";

describe("isCancelledBooking", () => {
  it("knows the cancelled family", () => {
    expect(isCancelledBooking("cancelled_trekker")).toBe(true);
    expect(isCancelledBooking("cancelled_guide")).toBe(true);
    expect(isCancelledBooking("cancelled")).toBe(true);
  });
  it("leaves live bookings alone", () => {
    expect(isCancelledBooking("pending_deposit")).toBe(false);
    expect(isCancelledBooking("confirmed")).toBe(false);
    expect(isCancelledBooking("completed")).toBe(false);
    expect(isCancelledBooking(null)).toBe(false);
    expect(isCancelledBooking(undefined)).toBe(false);
  });
});

describe("askOutcome", () => {
  it("sends when there is nothing for this trip and date", () => {
    expect(askOutcome({})).toBe("send");
    expect(askOutcome({ liveEnquiryId: null, bookingStatus: null })).toBe("send");
  });

  it("stops a second ask while one is still waiting on the guide", () => {
    expect(askOutcome({ liveEnquiryId: "e1" })).toBe("already-asked");
  });

  it("stops an ask for a trip already booked — the hole that let two through", () => {
    // The 2026-09-07 guard only looked at open and quoted requests, so once
    // the guide accepted, the identical ask sailed past it and produced a
    // second booking for a fortnight the guide had already committed.
    expect(askOutcome({ bookingStatus: "pending_deposit" })).toBe("already-booked");
    expect(askOutcome({ bookingStatus: "confirmed" })).toBe("already-booked");
  });

  it("lets them ask again after a trip fell through", () => {
    expect(askOutcome({ bookingStatus: "cancelled_guide" })).toBe("send");
    expect(askOutcome({ bookingStatus: "cancelled_trekker" })).toBe("send");
  });

  it("names the booking rather than the request when both exist", () => {
    expect(askOutcome({ liveEnquiryId: "e1", bookingStatus: "confirmed" })).toBe(
      "already-booked",
    );
  });

  it("falls back to the live request when the booking is dead", () => {
    expect(askOutcome({ liveEnquiryId: "e1", bookingStatus: "cancelled_guide" })).toBe(
      "already-asked",
    );
  });
});

describe("isUniqueViolation", () => {
  it("recognises the double-tap the index caught", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });
  it("is not fooled by anything else", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation({ message: "23505" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});
