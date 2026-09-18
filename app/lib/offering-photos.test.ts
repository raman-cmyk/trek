import { describe, expect, it, vi } from "vitest";
import { saveOfferingPhotos } from "./offerings.server";

/**
 * The photographs an editor can see are the photographs it owns.
 *
 * The delete used to be scoped to the editor's own `source`, so the office and
 * the guide could not see each other's rows. The office opened a trip, removed
 * three photographs, saved — and the guide's came straight back, because the
 * delete never touched them. Every save also re-inserted the whole shown list
 * under the saver's source, so the rows multiplied: one live trip reached nine
 * rows for three actual pictures.
 */
function fakeAdmin() {
  const calls: any = { deleted: [], inserted: [] };
  const from = (_t: string) => ({
    delete: () => ({
      eq: (col: string, val: string) => {
        calls.deleted.push({ col, val });
        // A second .eq() is what the old code did; record it so the test can
        // prove it is gone.
        return Object.assign(Promise.resolve({ error: null }), {
          eq: (c2: string, v2: string) => {
            calls.deleted.push({ col: c2, val: v2 });
            return Promise.resolve({ error: null });
          },
        });
      },
    }),
    insert: (rows: any[]) => {
      calls.inserted.push(...rows);
      return Promise.resolve({ error: null });
    },
  });
  return { client: { from } as any, calls };
}

const P = (url: string, alt = "") => ({ url, alt });

describe("saveOfferingPhotos", () => {
  it("clears every photo on the trip, not just its own source", async () => {
    const { client, calls } = fakeAdmin();
    await saveOfferingPhotos(client, "off-1", [P("a.jpg")], "ops");
    expect(calls.deleted).toEqual([{ col: "offering_id", val: "off-1" }]);
    // If a `source` filter ever comes back, the guide's photographs become
    // undeletable from the office again.
    expect(calls.deleted.some((d: any) => d.col === "source")).toBe(false);
  });

  it("removing a photo actually removes it", async () => {
    const { client, calls } = fakeAdmin();
    await saveOfferingPhotos(client, "off-1", [P("a.jpg"), P("c.jpg")], "ops");
    expect(calls.inserted.map((r: any) => r.url)).toEqual(["a.jpg", "c.jpg"]);
  });

  it("collapses the duplicates the form has been posting back", async () => {
    const { client, calls } = fakeAdmin();
    await saveOfferingPhotos(
      client,
      "off-1",
      [P("a.jpg"), P("b.jpg"), P("a.jpg"), P("b.jpg"), P("a.jpg")],
      "ops",
    );
    expect(calls.inserted.map((r: any) => r.url)).toEqual(["a.jpg", "b.jpg"]);
  });

  it("keeps the order it was given, because the first one is the cover", async () => {
    const { client, calls } = fakeAdmin();
    await saveOfferingPhotos(client, "off-1", [P("z.jpg"), P("a.jpg"), P("m.jpg")], "guide");
    expect(calls.inserted.map((r: any) => [r.url, r.sort])).toEqual([
      ["z.jpg", 0],
      ["a.jpg", 1],
      ["m.jpg", 2],
    ]);
  });

  it("drops blank urls rather than storing a row that renders nothing", async () => {
    const { client, calls } = fakeAdmin();
    await saveOfferingPhotos(client, "off-1", [P(""), P("  "), P("a.jpg")], "ops");
    expect(calls.inserted.map((r: any) => r.url)).toEqual(["a.jpg"]);
  });

  it("still gives a blank caption something true", async () => {
    const { client, calls } = fakeAdmin();
    await saveOfferingPhotos(client, "off-1", [P("a.jpg", "   ")], "ops");
    expect(calls.inserted[0].alt_text).toBe("Photograph from this trip");
  });

  it("clearing the list leaves none behind", async () => {
    const { client, calls } = fakeAdmin();
    const out = await saveOfferingPhotos(client, "off-1", [], "ops");
    expect(out.ok).toBe(true);
    expect(calls.inserted).toEqual([]);
    expect(calls.deleted).toEqual([{ col: "offering_id", val: "off-1" }]);
  });

  it("reports a failed delete instead of quietly inserting on top of it", async () => {
    const bad = {
      from: () => ({
        delete: () => ({ eq: () => Promise.resolve({ error: { message: "nope" } }) }),
        insert: () => Promise.resolve({ error: null }),
      }),
    } as any;
    const out = await saveOfferingPhotos(bad, "off-1", [P("a.jpg")], "ops");
    expect(out.ok).toBe(false);
    expect(out.error).toContain("nope");
  });
});
