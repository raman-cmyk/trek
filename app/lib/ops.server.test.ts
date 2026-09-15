import { describe, expect, it } from "vitest";
import { failureSentence, knownCause, one, rows, write, writeAll } from "./ops.server";

const ok = <T>(data: T) => Promise.resolve({ data, error: null });
const fails = (message: string, code?: string, details?: string) =>
  Promise.resolve({ data: null, error: { message, code, details: details ?? null } });

describe("rows", () => {
  it("hands back the list when it worked", async () => {
    expect(await rows(ok([{ id: 1 }]), "the bookings")).toEqual({
      rows: [{ id: 1 }],
      error: null,
    });
  });

  it("treats no rows as no rows, not as a failure", async () => {
    expect(await rows(ok(null as any), "the bookings")).toEqual({ rows: [], error: null });
  });

  it("keeps the reason instead of showing an empty page", async () => {
    // The bug this exists to prevent: /ops/users said "0 accounts" on a live
    // site with 71 of them, because the error was destructured away.
    const out = await rows(fails("permission denied", "42501"), "the accounts");
    expect(out.rows).toEqual([]);
    expect(out.error).toContain("Couldn't load the accounts");
    expect(out.error).toContain("42501");
  });
});

describe("one", () => {
  it("returns the row", async () => {
    expect(await one(ok({ id: 7 }), "this trek")).toEqual({ row: { id: 7 }, error: null });
  });

  it("does not call a missing row an error", async () => {
    expect(await one(ok(null as any), "this trek")).toEqual({ row: null, error: null });
  });

  it("does call a failed query an error", async () => {
    const out = await one(fails("boom"), "this trek");
    expect(out.error).toContain("Couldn't load this trek");
  });
});

describe("write", () => {
  it("reports success", async () => {
    expect(await write(ok(null), "the note")).toEqual({ ok: true, error: null });
  });

  it("reports failure rather than looking like it saved", async () => {
    const out = await write(fails("null value in column", "23502"), "the note");
    expect(out.ok).toBe(false);
    expect(out.error).toContain("the note");
  });
});

describe("writeAll", () => {
  it("runs every step when they all work", async () => {
    const seen: string[] = [];
    const step = (name: string) => ({
      get query() {
        seen.push(name);
        return ok(null);
      },
      what: name,
    });
    const out = await writeAll([step("a"), step("b")]);
    expect(out.ok).toBe(true);
    expect(seen).toEqual(["a", "b"]);
  });

  it("stops at the first failure so the screen never shows a half-applied state", async () => {
    let ran = false;
    const out = await writeAll([
      { query: fails("nope"), what: "the first thing" },
      {
        get query() {
          ran = true;
          return ok(null);
        },
        what: "the second thing",
      },
    ]);
    expect(out.ok).toBe(false);
    expect(out.error).toContain("the first thing");
    expect(ran).toBe(false);
  });
});

describe("knownCause", () => {
  it("names the embed ambiguity, which has broken this site three times", () => {
    expect(
      knownCause({ message: "Could not embed because more than one relationship was found" }),
    ).toMatch(/name which one/i);
  });

  it("names RLS", () => {
    expect(knownCause({ message: "x", code: "42501" })).toMatch(/row-level security/i);
  });

  it("names an unapplied migration", () => {
    expect(knownCause({ message: 'column "foo" does not exist', code: "42703" })).toMatch(
      /migration/i,
    );
  });

  it("says nothing rather than guessing", () => {
    expect(knownCause({ message: "some unfamiliar failure" })).toBeNull();
  });
});

describe("failureSentence", () => {
  it("leads with what the reader was trying to see", () => {
    const s = failureSentence("the payouts", { message: "boom", code: "XX000" });
    expect(s.startsWith("Couldn't load the payouts.")).toBe(true);
  });

  it("still carries the raw message, because that is what gets pasted to a developer", () => {
    expect(failureSentence("the payouts", { message: "boom" })).toContain("boom");
  });
});
