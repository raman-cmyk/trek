import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The ":: LABEL" line does not come back.
 *
 * Forty-one of these sat above the headings on twenty-two pages — ":: WHERE
 * THEY WALK", ":: PROOF OF LIFE", ":: FOR GUIDES". They were in the visual
 * direction as a system mark, and the founder read the system: "this makes the
 * website feel a lot AI". He is right that it is the tell. A human writing a
 * page about a guide in Nepal does not caption their own headings.
 *
 * The component is deleted, so a bare `<Eyebrow>` would already fail the
 * build. This catches the other way back in: somebody hand-rolling the same
 * mark as a literal "::" in front of a label, which compiles perfectly.
 */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx|ts)$/.test(name) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const APP = join(import.meta.dirname, "..");

describe("the :: eyebrow", () => {
  const files = walk(APP);

  it("has no component left to render", () => {
    expect(files.some((f) => f.endsWith("design/Eyebrow.tsx"))).toBe(false);
    const users = files.filter((f) => /<Eyebrow[\s/>]/.test(readFileSync(f, "utf8")));
    expect(users).toEqual([]);
  });

  it("is not hand-rolled back as a literal mark above a heading", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // A "::" sitting alone as rendered text — `>::<` after JSX-trimming, or
      // the string on its own line inside an element. Not `a::b` in CSS, not
      // "::" inside a longer sentence, and not a TypeScript namespace.
      if (/>\s*::\s*</.test(src) || /^\s*::\s*$/m.test(src)) offenders.push(f.slice(APP.length + 1));
    }
    expect(offenders).toEqual([]);
  });
});
