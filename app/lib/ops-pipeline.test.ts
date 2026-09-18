import { describe, it, expect } from "vitest";
import {
  BOARDS,
  boardFor,
  byColumn,
  columnFor,
  needsPermits,
  permitsSettled,
} from "./ops-pipeline";

const trek = (over: any = {}) => ({
  status: "confirmed",
  offering: { kind: "trek" },
  permit_applications: [],
  ...over,
});
const momo = (over: any = {}) => ({
  status: "confirmed",
  offering: { kind: "food_culture" },
  permit_applications: [],
  ...over,
});

describe("which board an experience belongs to", () => {
  it("puts anything with permits to file on the trek board", () => {
    expect(boardFor("trek")).toBe("treks");
    expect(boardFor("adventure")).toBe("treks");
  });

  it("puts the day experiences on their own", () => {
    for (const k of ["day_hike", "food_culture", "city"]) expect(boardFor(k)).toBe("day");
  });

  it("reads the permit question off the same tracks the trip page uses", () => {
    expect(needsPermits("trek")).toBe(true);
    expect(needsPermits("food_culture")).toBe(false);
  });

  it("treats an unknown kind as a trek, the careful way round", () => {
    expect(boardFor(null)).toBe("treks");
    expect(boardFor("hot_air_balloon")).toBe("treks");
  });
});

describe("docs pending means the passport and the insurance, nothing else", () => {
  it("holds a trek whose papers are not in", () => {
    expect(columnFor(trek({ status: "docs_pending" }))).toBe("docs_pending");
  });

  it("has no such column on the day board, where no papers are collected", () => {
    expect(BOARDS.find((b) => b.key === "day")!.columns).not.toContain("docs_pending");
    // The status can still exist on the row, so it has to land somewhere real.
    expect(columnFor(momo({ status: "docs_pending" }))).toBe("deposit_paid");
  });
});

describe("permits pending, which the booking status cannot tell you", () => {
  it("holds a confirmed trek with no permit filed yet", () => {
    expect(columnFor(trek({ permit_applications: [{ status: "todo" }] }))).toBe("permits_pending");
  });

  it("holds one where the permits are filed but not yet in hand", () => {
    expect(columnFor(trek({ permit_applications: [{ status: "filed" }] }))).toBe("permits_pending");
  });

  it("keeps a REJECTED permit here rather than letting it hide under Confirmed", () => {
    const mixed = trek({ permit_applications: [{ status: "ready" }, { status: "rejected" }] });
    expect(columnFor(mixed)).toBe("permits_pending");
    expect(permitsSettled("problem")).toBe(false);
  });

  it("moves to Confirmed only when every permit is in hand", () => {
    expect(columnFor(trek({ permit_applications: [{ status: "ready" }, { status: "ready" }] }))).toBe(
      "confirmed",
    );
  });

  it("does not hold a trek with no applications at all — nothing to chase", () => {
    // permitProgress calls an empty list "none"; a trek that needs no permit
    // filed would otherwise sit in the chase column for ever.
    expect(columnFor(trek({ permit_applications: [] }))).toBe("permits_pending");
  });

  it("never sends a day experience there", () => {
    expect(columnFor(momo())).toBe("confirmed");
    expect(BOARDS.find((b) => b.key === "day")!.columns).not.toContain("permits_pending");
  });
});

describe("every booking lands somewhere, or nowhere on purpose", () => {
  it("passes the plain statuses straight through", () => {
    for (const s of ["pending_deposit", "deposit_paid", "active", "completed"]) {
      expect(columnFor(trek({ status: s }))).toBe(s);
      expect(columnFor(momo({ status: s }))).toBe(s);
    }
  });

  it("keeps cancellations off the board rather than dropping them in a column", () => {
    expect(columnFor(trek({ status: "cancelled_trekker" }))).toBeNull();
    expect(columnFor(trek({ status: "cancelled_guide" }))).toBeNull();
  });

  it("sorts a mixed list onto the right board and loses nothing live", () => {
    const all = [
      trek({ status: "docs_pending" }),
      trek({ permit_applications: [{ status: "filed" }] }),
      trek({ permit_applications: [{ status: "ready" }] }),
      momo({ status: "active" }),
      momo(),
      trek({ status: "cancelled_trekker" }),
    ];
    const treks = byColumn(all, "treks");
    const day = byColumn(all, "day");

    expect(treks.docs_pending).toHaveLength(1);
    expect(treks.permits_pending).toHaveLength(1);
    expect(treks.confirmed).toHaveLength(1);
    expect(day.active).toHaveLength(1);
    expect(day.confirmed).toHaveLength(1);

    const placed =
      Object.values(treks).flat().length + Object.values(day).flat().length;
    expect(placed).toBe(all.length - 1); // everything but the cancellation
  });
});
