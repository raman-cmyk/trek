import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard rails for the ops area, so it stays cheap to add a page and hard to
 * add a broken one.
 *
 * Three failures have actually shipped here, and all three were silent:
 *
 *   1. A read whose error was destructured away, so the page said "0
 *      accounts" on a site with 71 of them.
 *   2. A write whose error was ignored, so a failed save looked exactly like
 *      a successful one.
 *   3. A page added to the router but not to the sidebar, reachable only by
 *      typing the URL.
 *
 * None of them would have failed a test, because each produced a page that
 * rendered perfectly. So they are checked here, against the source.
 *
 * On the allowlists: these are a RATCHET, not an excuse. Pages written before
 * app/lib/ops.server.ts existed are listed so the rule can be enforced on
 * everything new from today. The lists are only ever allowed to get shorter —
 * if you touch one of these pages, convert it and take it off the list.
 */

const ROUTES_DIR = join(process.cwd(), "app/routes");
const opsFiles = readdirSync(ROUTES_DIR).filter(
  (f) => f.startsWith("ops.") && f.endsWith(".tsx"),
);
const read = (f: string) => readFileSync(join(ROUTES_DIR, f), "utf8");

/**
 * Pages that predate app/lib/ops.server.ts and still swallow write errors.
 *
 * Generated from the source, not from memory. Only ever remove names.
 */
const LEGACY_SILENT_WRITES = new Set([
  "ops.bookings.$id.tsx",
  "ops.categories.tsx",
  "ops.contracts.tsx",
  "ops.events.tsx",
  "ops.experiences.$id.tsx",
  "ops.experiences.tsx",
  "ops.journals.$id.tsx",
  "ops.moderation.tsx",
  "ops.payouts.tsx",
  "ops.people.$id.tsx",
  "ops.people.tsx",
  "ops.permits.tsx",
  "ops.routes.$slug.page.tsx",
  "ops.routes.tsx",
  "ops.users.tsx",
]);

/**
 * Pages that predate app/lib/ops.server.ts and still swallow READ errors,
 * with how many each has.
 *
 * This is failure #1 in the header above — the one that said "0 accounts" on
 * a site with 72 — and until now this file named it and did not check for it.
 * Numbers, not names, because a page with five unsafe reads becomes safe one
 * read at a time and the ratchet should hold at every step.
 *
 * Only ever lower these. Delete the entry at zero.
 */
const LEGACY_SILENT_READS: Record<string, number> = {
  // Detail pages first: a refused read here shows an empty panel on a real
  // record — an empty Documents list is the passport check not happening.
  "ops.people.$id.tsx": 5,
  "ops.routes.$slug.page.tsx": 5,
  "ops.users.tsx": 5,
  "ops.bookings.$id.tsx": 3,
  "ops.experiences.$id.tsx": 3,
  "ops.journals.$id.tsx": 3,
  "ops.people.tsx": 2,
  "ops.routes.$slug.tsx": 2,
  "ops.data.tsx": 1,
  "ops.events.tsx": 1,
  "ops.experiences.new.tsx": 1,
  "ops.experiences.tsx": 1,
  "ops.journals.tsx": 1,
  "ops.moderation.tsx": 1,
  "ops.payouts.tsx": 1,
  "ops.permits.tsx": 1,
  "ops.search.tsx": 1,
  "ops.verifications.tsx": 1,
  // These two read the auth server rather than a table and already branch on
  // failure. The count is the shape of the call, not the bug.
  "ops.login.tsx": 4,
  "ops.users.enter.tsx": 1,
};

/** `const { data ... } = await ...` — the error discarded on the same line. */
function silentReads(src: string): number {
  return (src.match(/const\s*\{\s*data\b/g) ?? []).length;
}

/**
 * A write whose result nobody looks at.
 *
 * Matches `await admin.from(...).insert(...)` only when the statement is not
 * assigned to anything — an assigned result is at least available to check,
 * and checking it is what the helpers make easy.
 */
function silentWrites(src: string): string[] {
  const out: string[] = [];
  const re = /(^|\n)([ \t]*)await\s+admin[\s\S]{0,400}?\.(insert|update|upsert|delete)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // Walk back to the start of the statement; if it was assigned, it is fine.
    const lineStart = src.lastIndexOf("\n", m.index + 1) + 1;
    const line = src.slice(lineStart, src.indexOf("\n", m.index + 3));
    if (!/(const|let|var)\s|=\s*await/.test(line)) out.push(line.trim().slice(0, 80));
  }
  return out;
}

describe("ops pages report their failures", () => {
  it("finds ops routes to check at all", () => {
    // If a rename ever empties this list, every test below would pass while
    // checking nothing.
    expect(opsFiles.length).toBeGreaterThan(15);
  });

  for (const f of opsFiles) {
    if (LEGACY_SILENT_WRITES.has(f)) continue;
    it(`${f} checks whether its writes worked`, () => {
      expect(
        silentWrites(read(f)),
        `${f}: use write() from ~/lib/ops.server so a failed save is visible instead of looking like it worked`,
      ).toEqual([]);
    });
  }

  for (const f of opsFiles) {
    const allowed = LEGACY_SILENT_READS[f] ?? 0;
    it(`${f} keeps the reason a read failed`, () => {
      expect(
        silentReads(read(f)),
        `${f}: use rows()/one() from ~/lib/ops.server and render the error, so an empty screen can say why it is empty`,
      ).toBeLessThanOrEqual(allowed);
    });
  }

  it("the read allowlist only shrinks", () => {
    for (const [f, allowed] of Object.entries(LEGACY_SILENT_READS)) {
      expect(opsFiles, `${f} is allowlisted but no longer exists — remove it`).toContain(f);
      const n = silentReads(read(f));
      expect(n, `${f} is down to ${n} unsafe reads — lower its number in LEGACY_SILENT_READS`).toBe(
        allowed,
      );
    }
  });

  it("puts a captured error on the page rather than storing it", () => {
    // A held error nobody displays is still a silent failure.
    for (const f of ["ops.pipeline.tsx", "ops.bookings.$id.tsx", "ops.incidents.tsx"]) {
      const src = read(f);
      expect(src, `${f} captures the reason`).toMatch(/loadError|listError/);
      expect(src, `${f} renders it`).toMatch(/\{\s*(loadError|listError)\s*\}/);
    }
  });

  it("never answers a refused query with a 404", () => {
    // "Not found" is an answer about the record, not about the database, and
    // opening a live trek used to give it for both.
    const src = read("ops.bookings.$id.tsx");
    const notFound = src.indexOf("status: 404");
    expect(notFound).toBeGreaterThan(-1);
    expect(src.slice(0, notFound)).toMatch(/if \(booking\.error\) throw/);
  });

  it("the allowlist only shrinks", () => {
    for (const f of LEGACY_SILENT_WRITES) {
      // A stale name would silently exempt a future page that reused it.
      expect(opsFiles, `${f} is allowlisted but no longer exists — remove it`).toContain(f);
      // And a name that is already clean has no business being exempt.
      expect(
        silentWrites(read(f)).length,
        `${f} no longer swallows write errors — take it off LEGACY_SILENT_WRITES`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("every ops page is reachable", () => {
  const routesTs = readFileSync(join(process.cwd(), "app/routes.ts"), "utf8");
  const opsLayout = read("ops.tsx");

  /** Pages that are deliberately not in the sidebar. */
  const NOT_IN_NAV = new Set([
    "ops.tsx", // the layout itself
    "ops.login.tsx",
    "ops.logout.tsx",
    "ops.search.tsx", // reached from the search box in the sidebar
    "ops._index.tsx", // the dashboard, which IS the sidebar's home
    "ops.experiences.new.tsx", // reached from the experiences page
    "ops.users.enter.tsx", // an endpoint, not a page
  ]);

  const isDetail = (f: string) => f.includes(".$");

  for (const f of opsFiles) {
    if (NOT_IN_NAV.has(f) || isDetail(f)) continue;
    const path = "/" + f.replace(/\.tsx$/, "").split(".").join("/");

    it(`${f} is registered in routes.ts`, () => {
      const routePath = path.replace(/^\//, "");
      expect(routesTs, `add route("${routePath}", "routes/${f}") to app/routes.ts`).toContain(
        `"${routePath}"`,
      );
    });

    it(`${f} is linked from the sidebar`, () => {
      expect(
        opsLayout,
        `add { to: "${path}", label: "…" } to NAV in app/routes/ops.tsx, or list it in NOT_IN_NAV here`,
      ).toContain(`"${path}"`);
    });
  }
});
