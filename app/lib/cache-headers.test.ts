import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publicCacheHeaders } from "./cache-headers";

const h = (personalised: boolean) =>
  publicCacheHeaders({
    parentHeaders: new Headers(personalised ? { "x-personalised": "1" } : {}),
  })["Cache-Control"];

describe("the public cache policy", () => {
  it("never shares a page rendered for somebody who is signed in", () => {
    // The header carries their name and their unread count. This is the line
    // between "cached" and "handed a stranger your account".
    expect(h(true)).toContain("no-store");
    expect(h(true)).toContain("private");
  });

  it("caches an anonymous page at the edge for half an hour", () => {
    // Every miss is a full render — nine queries on the homepage — and
    // Cloudflare was killing 2-3% of requests for exceeding CPU.
    expect(h(false)).toMatch(/s-maxage=(\d+)/);
    const s = Number(h(false).match(/s-maxage=(\d+)/)![1]);
    expect(s).toBeGreaterThanOrEqual(900);
  });

  it("serves the old copy while fetching the new one, and if the worker fails", () => {
    expect(h(false)).toContain("stale-while-revalidate");
    expect(h(false)).toContain("stale-if-error");
  });

  it("still makes the browser check in, so signing out is not cached", () => {
    expect(h(false)).toContain("max-age=0");
    expect(h(false)).toContain("must-revalidate");
  });

  it("keeps the recovery script that makes a long cache safe", () => {
    // Stale HTML outliving a deploy asks for a bundle that deploy deleted.
    // Without chunk-recovery.ts in the document, widening this cache widens an
    // outage instead of preventing one.
    const root = readFileSync(join(import.meta.dirname, "..", "root.tsx"), "utf8");
    expect(root).toContain("CHUNK_RECOVERY_SCRIPT");
  });
});
