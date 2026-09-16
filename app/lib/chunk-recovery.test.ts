import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHUNK_RECOVERY_KEY,
  CHUNK_RECOVERY_PARAM,
  CHUNK_RECOVERY_SCRIPT,
} from "./chunk-recovery";

/**
 * The script that puts a page back together when its bundles were deleted by
 * a deploy while its HTML sat in the edge cache. Measured on production: the
 * document asked for /assets/root-DletlmBN.js when the worker had
 * root-ex2jCeV9.js, so the page rendered and then did nothing at all.
 */
describe("chunk recovery", () => {
  it("is inline in the document, before the bundles", () => {
    const root = readFileSync(join(import.meta.dirname, "..", "root.tsx"), "utf8");
    expect(root).toContain("CHUNK_RECOVERY_SCRIPT");
    // It cannot help if it loads as a module, because a module that 404s
    // never runs. It also has to be in <head>, ahead of <Scripts />.
    const head = root.slice(root.indexOf("<head>"), root.indexOf("</head>"));
    expect(head).toContain("CHUNK_RECOVERY_SCRIPT");
    expect(root.indexOf("CHUNK_RECOVERY_SCRIPT")).toBeLessThan(root.indexOf("<Scripts />"));
  });

  it("is valid JavaScript", () => {
    expect(() => new Function(CHUNK_RECOVERY_SCRIPT)).not.toThrow();
  });

  it("carries no closing script tag that would end its own element early", () => {
    expect(CHUNK_RECOVERY_SCRIPT.toLowerCase()).not.toContain("</script");
  });

  it("only reacts to the app's own bundles", () => {
    // A third-party pixel or a map tile script failing is not a reason to
    // reload somebody's page out from under them.
    expect(CHUNK_RECOVERY_SCRIPT).toContain('indexOf("/assets/")');
  });

  it("reloads at most once per tab", () => {
    expect(CHUNK_RECOVERY_SCRIPT).toContain(CHUNK_RECOVERY_KEY);
    expect(CHUNK_RECOVERY_SCRIPT).toContain("sessionStorage");
    // Set the guard BEFORE navigating, or the reloaded page races it.
    const setAt = CHUNK_RECOVERY_SCRIPT.indexOf("setItem");
    const goAt = CHUNK_RECOVERY_SCRIPT.indexOf("location.replace");
    expect(setAt).toBeGreaterThan(-1);
    expect(setAt).toBeLessThan(goAt);
  });

  it("busts the cache rather than asking for the same stale document again", () => {
    expect(CHUNK_RECOVERY_SCRIPT).toContain(CHUNK_RECOVERY_PARAM);
    expect(CHUNK_RECOVERY_SCRIPT).toContain("searchParams.set");
  });

  it("takes its own parameter back out of the URL", () => {
    expect(CHUNK_RECOVERY_SCRIPT).toContain("searchParams.delete");
    expect(CHUNK_RECOVERY_SCRIPT).toContain("replaceState");
  });

  it("survives sessionStorage being unavailable", () => {
    // Private windows and blocked site data throw on access, and a throw here
    // would take out every page on the site.
    expect(CHUNK_RECOVERY_SCRIPT).toContain("try{return sessionStorage}catch");
  });
});
