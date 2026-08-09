import { describe, it, expect } from "vitest";
import { reviewsToRelease } from "./reviews";

const t2g = (created: string, published: string | null = null) =>
  ({ direction: "trekker_to_guide" as const, created_at: created, published_at: published });
const g2t = (created: string, published: string | null = null) =>
  ({ direction: "guide_to_trekker" as const, created_at: created, published_at: published });

describe("double-blind review release", () => {
  it("holds a single side within the 14-day window", () => {
    expect(reviewsToRelease([t2g("2026-10-01")], "2026-10-05")).toHaveLength(0);
  });

  it("releases BOTH the moment the second side submits", () => {
    const rs = [t2g("2026-10-01"), g2t("2026-10-03")];
    expect(reviewsToRelease(rs, "2026-10-03")).toHaveLength(2);
  });

  it("releases a lone review once 14 days pass", () => {
    expect(reviewsToRelease([t2g("2026-10-01")], "2026-10-16")).toHaveLength(1);
    expect(reviewsToRelease([t2g("2026-10-01")], "2026-10-15")).toHaveLength(1);
    expect(reviewsToRelease([t2g("2026-10-01")], "2026-10-14")).toHaveLength(0);
  });

  it("never re-releases an already-published review", () => {
    const rs = [t2g("2026-10-01", "2026-10-03"), g2t("2026-10-03")];
    const out = reviewsToRelease(rs, "2026-10-03");
    expect(out).toHaveLength(1);
    expect(out[0].direction).toBe("guide_to_trekker");
  });
});
