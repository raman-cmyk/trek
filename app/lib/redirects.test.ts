import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirects";

const requestUrl = "https://trek.example/login";

describe("safeRedirectPath", () => {
  it("keeps same-origin paths including query and hash", () => {
    expect(safeRedirectPath("/guides?q=sherpa#results", requestUrl, "/"))
      .toBe("/guides?q=sherpa#results");
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example/phish",
    "/\\evil.example/phish",
    "\\\\evil.example/phish",
    "/guides\nLocation: https://evil.example",
  ])("rejects an external or ambiguous target: %s", (target) => {
    expect(safeRedirectPath(target, requestUrl, "/guides")).toBe("/guides");
  });

  it("rejects a different port on the same hostname", () => {
    expect(safeRedirectPath("https://trek.example:444/guides", requestUrl, "/"))
      .toBe("/");
  });
});
