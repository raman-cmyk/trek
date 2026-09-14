import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A guard against the quietest kind of production break.
 *
 * PostgREST resolves `trekker:users(full_name)` by finding the one foreign key
 * between the two tables. The moment a second one exists it refuses the query
 * (PGRST201) — and supabase-js hands back `{ data: null }`, which every loader
 * in this codebase spells `?? []`. So the page does not throw: it renders its
 * empty state. "No trips yet" on a guide with ten bookings.
 *
 * That is exactly what happened when `bookings.meeting_set_by` (migration
 * 0061) landed on a production database that already carried an undocumented
 * `bookings.insurance_rejected_by`: fifteen queries across twelve files began
 * returning nothing, and the build, the types and the tests all stayed green.
 *
 * So: a `users` embed whose parent table has more than one foreign key to
 * `users` must name the key. This reads the source rather than the database,
 * because the point is to fail in CI before a migration reaches anybody.
 *
 * Add a second FK to users from some table? Add it to AMBIGUOUS and this test
 * will name every query that needs qualifying.
 */

/** Tables with more than one foreign key to `users`, as of migration 0062. */
const AMBIGUOUS = new Set([
  "bookings",
  "booking_documents",
  "conversations",
  "events",
  "reviews",
  "permit_applications",
  "account_blocks",
]);

const EMBED_TARGET = "users";

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

interface Embed {
  /** The table being embedded, e.g. "users". */
  table: string;
  /** Whether it named a foreign key: users!some_fkey(…). */
  named: boolean;
  /** What it hangs off — an enclosing embed, or the queried table. */
  parent: string;
}

/**
 * Walk a PostgREST select string and report every embed with its parent.
 *
 * Nesting is the whole point: in `guide:guides(users(full_name))` the `users`
 * embed hangs off `guides`, which has exactly one link to it, so it is fine.
 * The same text one level up would not be.
 */
export function parseEmbeds(select: string, root: string): Embed[] {
  const embeds: Embed[] = [];
  const stack: string[] = [root];
  let token = "";
  for (const ch of select) {
    if (ch === "(") {
      // "alias:table!constraint" — the alias and the constraint are noise here.
      const spec = token.trim().split(",").pop()!.trim();
      const afterAlias = spec.includes(":") ? spec.slice(spec.lastIndexOf(":") + 1) : spec;
      const [table, constraint] = afterAlias.split("!");
      embeds.push({
        table: table.trim(),
        named: Boolean(constraint),
        parent: stack[stack.length - 1],
      });
      stack.push(table.trim());
      token = "";
    } else if (ch === ")") {
      if (stack.length > 1) stack.pop();
      token = "";
    } else {
      token += ch;
    }
  }
  return embeds;
}

/** Every unnamed `users` embed hanging off a table with two links to users. */
function offenders(): string[] {
  const bad: string[] = [];
  for (const file of sourceFiles("app")) {
    const lines = readFileSync(file, "utf8").split("\n");
    let root: string | null = null;
    lines.forEach((line, i) => {
      const from = /from\("([a-z_]+)"\)/.exec(line);
      if (from) root = from[1];
      if (!root || !line.includes(`${EMBED_TARGET}(`)) return;
      for (const e of parseEmbeds(line, root)) {
        if (e.table === EMBED_TARGET && !e.named && AMBIGUOUS.has(e.parent)) {
          bad.push(`${file}:${i + 1} — ${EMBED_TARGET} on ${e.parent}: ${line.trim().slice(0, 90)}`);
        }
      }
    });
  }
  return bad;
}

describe("the select-string parser", () => {
  it("sees what an embed hangs off", () => {
    const e = parseEmbeds('"id, trekker:users(full_name), guide:guides(users(full_name))"', "bookings");
    expect(e).toEqual([
      { table: "users", named: false, parent: "bookings" },
      { table: "guides", named: false, parent: "bookings" },
      // Fine: guides has exactly one link to users.
      { table: "users", named: false, parent: "guides" },
    ]);
  });

  it("notices a named foreign key", () => {
    const e = parseEmbeds('"trekker:users!bookings_trekker_id_fkey(full_name)"', "bookings");
    expect(e).toEqual([{ table: "users", named: true, parent: "bookings" }]);
  });

  it("follows nesting back out again", () => {
    const e = parseEmbeds('"a:offerings(route:routes(name)), trekker:users(x)"', "bookings");
    expect(e.map((x) => `${x.table}<-${x.parent}`)).toEqual([
      "offerings<-bookings",
      "routes<-offerings",
      "users<-bookings",
    ]);
  });
});

describe("every users embed on a table with two links to users is named", () => {
  it("so a new foreign key cannot silently empty a page", () => {
    const bad = offenders();
    expect(
      bad.join("\n"),
      `Name the foreign key, e.g. users!bookings_trekker_id_fkey(…):\n${bad.join("\n")}`,
    ).toBe("");
  });
});
