import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard against the bug that emptied the ops console.
 *
 * PostgREST resolves `trekker:users(...)` by looking for ONE foreign key from
 * the parent table to `users`. `bookings` has three — trekker_id,
 * meeting_set_by and insurance_rejected_by — so the embed is ambiguous and
 * the request fails. Supabase returns `{ data: null, error }`, every caller
 * in this codebase destructures only `data`, and the page renders as though
 * the database were empty. The booking pipeline read "0" with 29 bookings in
 * it; a live trek 404'd; the office believed the platform had no traffic.
 *
 * The fix is to name the key: `users!bookings_trekker_id_fkey(...)`. This
 * test exists so that adding a second foreign key to a table — which is what
 * caused it, twice, with meeting_set_by and insurance_rejected_by — cannot
 * quietly break every query that embeds it.
 *
 * The list is the schema's, not a guess: `select conrelid::regclass, count(*)
 * from pg_constraint where contype='f' and confrelid='users'::regclass group
 * by 1 having count(*) > 1`. Add to it when a migration adds one.
 */
const AMBIGUOUS_PARENTS = [
  "account_blocks",
  "booking_documents",
  "bookings",
  "conversations",
  "events",
  "permit_applications",
  "reviews",
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(full);
  }
  return out;
}

/**
 * Every `.select("…")` in the file, with the table it selects from.
 */
function selects(src: string): { table: string; body: string; at: number }[] {
  const out: { table: string; body: string; at: number }[] = [];
  for (const m of src.matchAll(/\.select\(\s*"((?:[^"\\]|\\.)*)"/g)) {
    const before = src.slice(0, m.index!);
    const froms = [...before.matchAll(/\.from\("(\w+)"\)/g)];
    out.push({
      table: froms.length ? froms[froms.length - 1][1] : "?",
      body: m[1],
      at: m.index!,
    });
  }
  return out;
}

/**
 * Which table an embed at `pos` inside a select string hangs off: the
 * innermost embed still open around it — `booking:bookings(… here …)` — or
 * the selected table when nothing encloses it.
 */
function parentOf(body: string, pos: number, table: string): string {
  const opens = [...body.slice(0, pos).matchAll(/(?:\w+:)?(\w+)\(/g)];
  for (let i = opens.length - 1; i >= 0; i--) {
    const after = body.slice(opens[i].index! + opens[i][0].length, pos);
    const closed = (after.match(/\)/g) ?? []).length - (after.match(/\(/g) ?? []).length;
    if (closed <= 0) return opens[i][1];
  }
  return table;
}

describe("PostgREST embeds of users", () => {
  it("names the foreign key wherever the parent table has more than one", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles("app")) {
      const src = readFileSync(file, "utf8");
      for (const sel of selects(src)) {
        // `users!fkey(` is already explicit; only a bare `users(` is ambiguous.
        for (const m of sel.body.matchAll(/(?<![!\w])(?:\w+:)?users\(/g)) {
          const parent = parentOf(sel.body, m.index!, sel.table);
          if (AMBIGUOUS_PARENTS.includes(parent)) {
            const line = src.slice(0, sel.at).split("\n").length;
            offenders.push(`${file}:${line} — ${m[0]} on "${parent}"`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
