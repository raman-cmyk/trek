import { describe, it, expect } from "vitest";
import { ago, badgeCount, bodyFromText, hrefFor, unreadCount } from "./inapp";

const row = (read: string | null) => ({ read_at: read });

describe("the number on the bell", () => {
  it("is nothing at all when everything is read", () => {
    expect(badgeCount([row("2026-09-14T00:00:00Z"), row("2026-09-13T00:00:00Z")])).toBeNull();
    expect(badgeCount([])).toBeNull();
  });

  it("counts only the unread", () => {
    expect(badgeCount([row(null), row("2026-09-14T00:00:00Z"), row(null)])).toBe("2");
    expect(unreadCount([row(null), row("x"), row(null)])).toBe(2);
  });

  it("stops counting past nine, because 23 unread changes nothing", () => {
    expect(badgeCount(Array.from({ length: 23 }, () => row(null)))).toBe("9+");
    expect(badgeCount(Array.from({ length: 9 }, () => row(null)))).toBe("9");
  });
});

describe("where a notification leads", () => {
  it("uses its own path when it has one", () => {
    expect(hrefFor("deposit_paid", "/trips/abc")).toBe("/trips/abc");
  });

  it("falls back to somewhere real rather than nowhere", () => {
    expect(hrefFor("deposit_paid", null)).toBe("/trips");
    expect(hrefFor("new_enquiry", "")).toBe("/g/enquiries");
    expect(hrefFor("something_new", null)).toBe("/");
  });

  it("refuses anything that is not our own path", () => {
    expect(hrefFor("deposit_paid", "https://evil.example/x")).toBe("/trips");
    expect(hrefFor("deposit_paid", "//evil.example/x")).toBe("/trips");
    expect(hrefFor("deposit_paid", "/\\evil.example/x")).toBe("/trips");
    expect(hrefFor("deposit_paid", "javascript:alert(1)")).toBe("/trips");
  });
});

describe("how long ago", () => {
  const now = new Date("2026-09-14T12:00:00Z");
  it("reads the way somebody would say it", () => {
    expect(ago("2026-09-14T11:59:40Z", now)).toBe("just now");
    expect(ago("2026-09-14T11:36:00Z", now)).toBe("24 min ago");
    expect(ago("2026-09-14T09:00:00Z", now)).toBe("3 hours ago");
    expect(ago("2026-09-13T11:00:00Z", now)).toBe("1 day ago");
    expect(ago("2026-07-14T12:00:00Z", now)).toBe("2 months ago");
  });

  it("copes with the space-separated stamps Postgres hands back", () => {
    expect(ago("2026-09-14 11:00:00+00", now)).toBe("1 hour ago");
  });

  it("never says a notification arrived in the future", () => {
    expect(ago("2026-09-14T12:05:00Z", now)).toBe("just now");
  });
});

describe("one sentence from an email", () => {
  it("takes the first real sentence", () => {
    expect(bodyFromText("Pemba accepted your request. Pay the deposit to lock it in.")).toBe(
      "Pemba accepted your request.",
    );
  });

  it("truncates rather than printing a paragraph on a bell", () => {
    const long = `${"word ".repeat(60)}end.`;
    expect(bodyFromText(long)!.length).toBeLessThanOrEqual(160);
    expect(bodyFromText(long)!.endsWith("…")).toBe(true);
  });

  it("is null when there is nothing to say", () => {
    expect(bodyFromText("")).toBeNull();
    expect(bodyFromText(null)).toBeNull();
  });
});

describe("a stamp we cannot read", () => {
  it("says nothing rather than 'NaN months ago'", () => {
    expect(ago("not a date")).toBe("");
  });
});
