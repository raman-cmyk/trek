import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A form inside a layout must say where it posts.
 *
 * `<Form method="post">` with no action posts to whichever page is currently
 * on screen. In a leaf route that is what you want. In a LAYOUT — which wraps
 * many pages — it means the same button hits a different action on every tab:
 * the guide dashboard's sign-out was a 405 error page on Earnings and Messages
 * (no action there) and a silent no-op on Requests and the Calendar, which ran
 * those pages' actions instead and left the guide signed in. The office's
 * sign-out had the identical bug.
 *
 * The failure is invisible in a type check and in every unit test, so it is
 * caught here, at the only place it is visible: the source.
 */
const ROUTES = join(process.cwd(), "app/routes");

/** Route modules that render an <Outlet/> — the layouts, whatever their name. */
function layoutFiles(): string[] {
  return readdirSync(ROUTES)
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => {
      const src = readFileSync(join(ROUTES, f), "utf8");
      return /<Outlet\b/.test(src);
    });
}

describe("forms in layout routes", () => {
  const layouts = layoutFiles();

  it("finds the layouts to check", () => {
    expect(layouts.length).toBeGreaterThan(0);
    expect(layouts).toContain("g.tsx");
    expect(layouts).toContain("ops.tsx");
  });

  it.each(layoutFiles())("%s posts every form to a named action", (file) => {
    const src = readFileSync(join(ROUTES, file), "utf8");
    const posts = src.match(/<Form[^>]*method="post"[^>]*>/g) ?? [];
    const actionless = posts.filter((tag) => !/\saction=/.test(tag));
    expect(actionless).toEqual([]);
  });
});

describe("the sign-out routes exist and end the session", () => {
  it.each([
    ["g.logout.tsx", "/g/login"],
    ["ops.logout.tsx", "/ops/login"],
  ])("%s signs out and returns to %s", (file, login) => {
    const src = readFileSync(join(ROUTES, file), "utf8");
    expect(src).toContain("signOut()");
    expect(src).toContain(login);
    // Both verbs: a POST from the button, and a GET from a typed URL or a
    // bookmark, which used to bounce home leaving the person signed in.
    expect(src).toMatch(/export async function action/);
    expect(src).toMatch(/export async function loader/);
  });
});
