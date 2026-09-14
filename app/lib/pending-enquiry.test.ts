import { describe, it, expect } from "vitest";
import { PENDING_TTL_MS, packPending, unpackPending } from "./pending-enquiry";

const NOW = 1_800_000_000_000;
const fields = {
  offeringId: "11111111-2222-3333-4444-555555555555",
  guideId: "66666666-7777-8888-9999-aaaaaaaaaaaa",
  startDate: "2026-11-28",
  partySize: 3,
  message: "Can we start later?",
  arrivalDate: "2026-11-26",
  selectedOptions: ["porter", "gear"],
  returnTo: "/experiences/kathmandu-momo-crawl",
};

describe("parking a request through sign-in", () => {
  it("comes back exactly as it went in", () => {
    const back = unpackPending(packPending(fields, NOW), NOW + 1000);
    expect(back).toEqual({ ...fields, at: NOW });
  });

  it("survives a realistic sign-up — a few minutes and an email", () => {
    const back = unpackPending(packPending(fields, NOW), NOW + 8 * 60_000);
    expect(back?.startDate).toBe("2026-11-28");
  });

  it("expires, so a request does not surface days later on a shared laptop", () => {
    expect(unpackPending(packPending(fields, NOW), NOW + PENDING_TTL_MS + 1)).toBeNull();
  });

  it("refuses one stamped in the future", () => {
    expect(unpackPending(packPending(fields, NOW + 600_000), NOW)).toBeNull();
  });
});

describe("nothing on the way back is trusted", () => {
  const packed = (over: Record<string, unknown>) =>
    unpackPending(JSON.stringify({ ...fields, at: NOW, ...over }), NOW);

  it("drops a request whose ids are not ids", () => {
    expect(packed({ offeringId: "or 1=1" })).toBeNull();
    expect(packed({ guideId: "" })).toBeNull();
  });

  it("drops an impossible date or party", () => {
    expect(packed({ startDate: "28/11/2026" })).toBeNull();
    expect(packed({ partySize: 0 })).toBeNull();
    expect(packed({ partySize: 900 })).toBeNull();
    expect(packed({ partySize: "lots" })).toBeNull();
  });

  it("refuses to carry an off-site destination", () => {
    expect(packed({ returnTo: "https://evil.example/x" })?.returnTo).toBe("/");
    expect(packed({ returnTo: "//evil.example" })?.returnTo).toBe("/");
    expect(packed({ returnTo: 42 })?.returnTo).toBe("/");
  });

  it("keeps a bad arrival date out rather than failing the whole request", () => {
    expect(packed({ arrivalDate: "soon" })?.arrivalDate).toBeNull();
    expect(packed({ arrivalDate: "soon" })?.startDate).toBe("2026-11-28");
  });

  it("caps the extras and the message", () => {
    const many = Array.from({ length: 40 }, (_, i) => `opt${i}`);
    expect(packed({ selectedOptions: many })?.selectedOptions).toHaveLength(20);
    expect(packed({ selectedOptions: "porter" })?.selectedOptions).toEqual([]);
    expect(packed({ message: "x".repeat(5000) })?.message).toHaveLength(2000);
  });

  it("is null for nothing at all, or for junk", () => {
    expect(unpackPending(null, NOW)).toBeNull();
    expect(unpackPending("", NOW)).toBeNull();
    expect(unpackPending("not json", NOW)).toBeNull();
    expect(unpackPending("[]", NOW)).toBeNull();
  });
});
