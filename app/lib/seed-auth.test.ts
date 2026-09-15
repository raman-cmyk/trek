import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every seeded auth user must carry empty-string token columns.
 *
 * GoTrue scans these into Go strings, which cannot hold NULL, so a SINGLE row
 * with a NULL token makes the admin listUsers call fail for every account —
 * not just that row. Two seeded applicant guides did exactly that, and
 * /ops/users spent it reporting "Database error finding users" and then "0
 * accounts" on a platform with 72 of them.
 *
 * The first insert in seed.sql always had it right, with a comment saying
 * why. A later block was added without it. A comment did not prevent this;
 * a test does.
 */
const REQUIRED = [
  "confirmation_token",
  "recovery_token",
  "email_change_token_new",
  "email_change",
  "email_change_token_current",
  "phone_change",
  "phone_change_token",
  "reauthentication_token",
];

const seed = readFileSync(join(process.cwd(), "supabase/seed.sql"), "utf8");

/** The column list of every `insert into auth.users (...)` in the file. */
function authInserts(sql: string): string[] {
  const out: string[] = [];
  const re = /insert\s+into\s+auth\.users\s*\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) out.push(m[1]);
  return out;
}

describe("seeded auth users", () => {
  const inserts = authInserts(seed);

  it("finds the inserts to check", () => {
    // A rewrite that stopped matching would make every assertion below pass
    // while checking nothing.
    expect(inserts.length).toBeGreaterThan(0);
  });

  for (const [i, columns] of inserts.entries()) {
    it(`insert #${i + 1} sets every token column`, () => {
      const missing = REQUIRED.filter((c) => !new RegExp(`\\b${c}\\b`).test(columns));
      expect(
        missing,
        `seed.sql insert #${i + 1} omits ${missing.join(", ")} — they default to NULL, ` +
          `and one NULL token breaks the admin user directory for every account`,
      ).toEqual([]);
    });
  }
});
