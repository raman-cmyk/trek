import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The migration numbers have to be unique.
 *
 * On 19 Sep 2026 a parallel branch, cut from an abandoned line, added its own
 * `0069_security_boundaries.sql` and `0070_atomic_deposit_fulfilment.sql`.
 * Both numbers were already taken on the line that is actually deployed — by
 * `0069_offering_photos.sql` and `0070_atomic_deposit_fulfilment.sql` doing
 * entirely different work — so merging the two would have produced a
 * migrations directory where the order of the files no longer describes the
 * order the database was built in.
 *
 * Nothing caught it, because nothing looks. This looks.
 */
const DIR = join(process.cwd(), "supabase", "migrations");

/**
 * One pair that already shipped this way, before anything was checking.
 *
 * Both were applied to production months ago, so renaming a file now would
 * change nothing in the database and might well confuse whatever recorded
 * them as run. It is written down here instead: a ratchet, not an amnesty —
 * this list must never grow.
 */
const KNOWN = ["0090: 0090_hooks_that_read_wrong.sql vs 0090_offering_photos_unique.sql"];

function numbered(): Array<{ n: string; file: string }> {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((file) => ({ n: (file.match(/^(\d+)/) ?? [])[1] ?? "", file }));
}

describe("the migrations directory", () => {
  it("numbers every migration", () => {
    const unnumbered = numbered().filter((m) => !m.n);
    expect(unnumbered.map((m) => m.file)).toEqual([]);
  });

  it("never gives two migrations the same number", () => {
    const seen = new Map<string, string[]>();
    for (const { n, file } of numbered()) {
      if (!n) continue;
      seen.set(n, [...(seen.get(n) ?? []), file]);
    }
    const clashes = [...seen.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([n, files]) => `${n}: ${files.sort().join(" vs ")}`)
      .filter((c) => !KNOWN.includes(c));
    // A clash is almost always two branches that each took the next free
    // number. Renumber the newer one; do not merge them.
    expect(clashes).toEqual([]);
  });

  it("keeps the numbers the same width, so they sort the way they run", () => {
    const odd = numbered().filter((m) => m.n && m.n.length !== 4);
    expect(odd.map((m) => m.file)).toEqual([]);
  });
});
