import { describe, expect, it } from "vitest";
import { linkParts, shortLink } from "./linkify";

describe("linkParts", () => {
  it("leaves plain text alone", () => {
    expect(linkParts("see you at six")).toEqual([{ kind: "text", value: "see you at six" }]);
  });

  it("finds a link in the middle of a sentence", () => {
    const parts = linkParts("Sending our spot https://maps.app.goo.gl/x7Kq2mNb4 — tap it");
    expect(parts.map((p) => p.kind)).toEqual(["text", "link", "text"]);
    expect(parts[1].href).toBe("https://maps.app.goo.gl/x7Kq2mNb4");
  });

  it("does not swallow the full stop that ends the sentence", () => {
    const parts = linkParts("It is at https://example.com/a.");
    expect(parts[1].href).toBe("https://example.com/a");
    expect(parts[2].value).toBe(".");
  });

  it("leaves a closing bracket outside the link", () => {
    const parts = linkParts("(see https://example.com/x)");
    expect(parts[1].href).toBe("https://example.com/x");
    expect(parts[2].value).toBe(")");
  });

  it("handles two links in one line", () => {
    const parts = linkParts("https://a.com and https://b.com");
    expect(parts.filter((p) => p.kind === "link").map((p) => p.href)).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("takes a geo: URI, which is what some Android share sheets give", () => {
    expect(linkParts("geo:27.7172,85.324")[0].href).toBe("geo:27.7172,85.324");
  });

  it("does not turn a bare domain into a link — too many false positives", () => {
    expect(linkParts("ask at guidesofnepal.com")).toHaveLength(1);
  });

  it("never treats markup as a link", () => {
    const parts = linkParts("<b>https://x.com</b>");
    expect(parts.find((p) => p.kind === "link")?.href).toBe("https://x.com");
  });
});

describe("shortLink", () => {
  it("drops the scheme and the trailing slash", () => {
    expect(shortLink("https://example.com/")).toBe("example.com");
  });

  it("truncates something too long to fit a phone", () => {
    const long = shortLink(`https://example.com/${"a".repeat(80)}`);
    expect(long.length).toBe(40);
    expect(long.endsWith("…")).toBe(true);
  });
});
