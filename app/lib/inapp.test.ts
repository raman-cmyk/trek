import { describe, expect, it } from "vitest";
import { badgeLabel, hrefFromBody, previewOf, shouldNotifyInApp, unreadCount, whenLabel } from "./inapp";

const SITE = "https://guidesofnepal.com";

describe("shouldNotifyInApp", () => {
  it("takes ordinary transactional mail", () => {
    expect(shouldNotifyInApp("transactional", "enquiry_accepted")).toBe(true);
    expect(shouldNotifyInApp(undefined, "deposit_paid")).toBe(true);
  });

  it("leaves marketing alone — an unread badge for a newsletter kills the bell", () => {
    expect(shouldNotifyInApp("marketing", "monthly_roundup")).toBe(false);
  });

  it("leaves mail addressed to the office alone", () => {
    expect(shouldNotifyInApp("transactional", "insurance_interest_ops")).toBe(false);
    expect(shouldNotifyInApp("transactional", "ops_daily_digest")).toBe(false);
  });

  it("will not make a notification it cannot label", () => {
    expect(shouldNotifyInApp("transactional", "")).toBe(false);
    expect(shouldNotifyInApp("transactional", null)).toBe(false);
  });
});

describe("hrefFromBody", () => {
  it("takes the link the email was written around, as a path", () => {
    const body = `Good news: Pemba accepted.\n\nPay your deposit:\n${SITE}/checkout/abc-123`;
    expect(hrefFromBody(body, SITE)).toBe("/checkout/abc-123");
  });

  it("takes the first of several", () => {
    const body = `See ${SITE}/trips/1 or ${SITE}/trips/2`;
    expect(hrefFromBody(body, SITE)).toBe("/trips/1");
  });

  it("never sends somebody off the platform", () => {
    expect(hrefFromBody(`Read https://example.com/article`, SITE)).toBeNull();
  });

  it("is null when there is nothing to open", () => {
    expect(hrefFromBody("Your account is suspended.", SITE)).toBeNull();
  });

  it("copes with a trailing slash on the configured site url", () => {
    expect(hrefFromBody(`${SITE}/trips/9`, `${SITE}/`)).toBe("/trips/9");
  });
});

describe("previewOf", () => {
  it("is the words without the link", () => {
    expect(previewOf(`Pemba accepted your request.\n\nPay here:\n${SITE}/checkout/a`)).toBe(
      "Pemba accepted your request. Pay here:",
    );
  });

  it("cuts on a sentence rather than mid-word", () => {
    const long = `${"First sentence is quite long and rambling on. ".repeat(3)}Second.`;
    const p = previewOf(long, 60)!;
    expect(p.endsWith(".")).toBe(true);
    expect(p.length).toBeLessThanOrEqual(61);
  });

  it("is null when the email is nothing but a link", () => {
    expect(previewOf(`${SITE}/trips/1`)).toBeNull();
  });
});

describe("unreadCount and badgeLabel", () => {
  it("counts only the unread", () => {
    expect(unreadCount([{ read_at: null }, { read_at: "2026-09-01" }, { read_at: null }])).toBe(2);
  });

  it("shows nothing at zero", () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(-1)).toBeNull();
  });

  it("stops counting past 99", () => {
    expect(badgeLabel(7)).toBe("7");
    expect(badgeLabel(99)).toBe("99");
    expect(badgeLabel(140)).toBe("99+");
  });
});

describe("whenLabel", () => {
  const now = "2026-09-14T12:00:00Z";
  it("reads as a list is scanned", () => {
    expect(whenLabel("2026-09-14T11:59:40Z", now)).toBe("Just now");
    expect(whenLabel("2026-09-14T11:30:00Z", now)).toBe("30 min ago");
    expect(whenLabel("2026-09-14T04:00:00Z", now)).toBe("8h ago");
    expect(whenLabel("2026-09-13T04:00:00Z", now)).toBe("Yesterday");
    expect(whenLabel("2026-09-10T04:00:00Z", now)).toBe("Thursday");
    expect(whenLabel("2026-08-12T04:00:00Z", now)).toBe("12 Aug");
  });

  it("says nothing rather than Invalid Date", () => {
    expect(whenLabel("not a date", now)).toBe("");
  });
});
