import { describe, expect, it } from "vitest";
import { siteLink, siteOrigin, siteUrl } from "./site-url";

describe("where the site lives", () => {
  it("uses the address that is configured", () => {
    expect(siteOrigin("https://guidesofnepal.com")).toBe("https://guidesofnepal.com");
    expect(siteOrigin("https://trek.raman-7d9.workers.dev")).toBe(
      "https://trek.raman-7d9.workers.dev",
    );
  });

  it("falls back to the real domain rather than to nothing", () => {
    expect(siteOrigin(undefined)).toBe("https://guidesofnepal.com");
    expect(siteOrigin(null)).toBe("https://guidesofnepal.com");
    expect(siteOrigin("")).toBe("https://guidesofnepal.com");
    expect(siteOrigin("   ")).toBe("https://guidesofnepal.com");
  });

  it("refuses the string 'undefined', which is what a bare interpolation leaves", () => {
    // `Reply: ${env.SITE_URL}/messages/abc` with SITE_URL unset sent a guide
    // a link beginning "undefined/". This is that bug, written down.
    expect(siteOrigin("undefined")).toBe("https://guidesofnepal.com");
    expect(siteOrigin("null")).toBe("https://guidesofnepal.com");
    expect(siteOrigin("/trips")).toBe("https://guidesofnepal.com");
  });

  it("never ends in a slash, however many were configured", () => {
    expect(siteOrigin("https://guidesofnepal.com/")).toBe("https://guidesofnepal.com");
    expect(siteOrigin("https://guidesofnepal.com///")).toBe("https://guidesofnepal.com");
  });

  it("reads the origin straight off the environment", () => {
    expect(siteUrl({ SITE_URL: "https://example.com/" })).toBe("https://example.com");
    expect(siteUrl({})).toBe("https://guidesofnepal.com");
  });
});

describe("linking to a page", () => {
  it("joins with exactly one slash, whichever side brought it", () => {
    const env = { SITE_URL: "https://guidesofnepal.com/" };
    expect(siteLink(env, "/trips/abc")).toBe("https://guidesofnepal.com/trips/abc");
    expect(siteLink(env, "trips/abc")).toBe("https://guidesofnepal.com/trips/abc");
  });

  it("gives the bare origin for the site's own front page", () => {
    expect(siteLink({ SITE_URL: "https://guidesofnepal.com" }, "")).toBe(
      "https://guidesofnepal.com/",
    );
  });
});
