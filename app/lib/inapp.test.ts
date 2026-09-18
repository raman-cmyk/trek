import { describe, expect, it } from "vitest";
import {
  badgeLabel,
  hrefFromBody,
  notificationRow,
  opsHref,
  previewOf,
  recipientsFor,
  shouldNotifyInApp,
  unreadCount,
  whenLabel,
} from "./inapp";

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

describe("building the row", () => {
  const base = { userId: "u1", kind: "new_enquiry", title: "New request" };

  it("takes the link it was handed rather than hunting the text for one", () => {
    const row = notificationRow({
      ...base,
      href: "/g/enquiries",
      text: "Open https://guidesofnepal.com/trips/abc to see it",
      siteUrl: "https://guidesofnepal.com",
    });
    expect(row?.href).toBe("/g/enquiries");
  });

  it("still finds the link in the text when nobody named one", () => {
    const row = notificationRow({
      ...base,
      text: "Pay your deposit: https://guidesofnepal.com/checkout/abc",
      siteUrl: "https://guidesofnepal.com",
    });
    expect(row?.href).toBe("/checkout/abc");
  });

  it("trims the title before cutting it to what the column will take", () => {
    const row = notificationRow({ ...base, title: `   ${"x".repeat(250)}   ` });
    expect(row?.title.length).toBe(200);
    expect(row?.title.startsWith("x")).toBe(true);
  });

  it("refuses a title of nothing, rather than letting the database refuse it", () => {
    // `length(btrim(title)) between 1 and 200` (0079). The old code did
    // `subject.slice(0, 200)` with no trim, so a subject of spaces threw and
    // the throw disappeared into a catch.
    expect(notificationRow({ ...base, title: "   " })).toBeNull();
    expect(notificationRow({ ...base, title: "" })).toBeNull();
  });

  it("refuses a row with nobody to send it to, or nothing to call it", () => {
    expect(notificationRow({ ...base, userId: "" })).toBeNull();
    expect(notificationRow({ ...base, kind: " " })).toBeNull();
  });

  it("never stores a link that leaves the site", () => {
    expect(notificationRow({ ...base, href: "https://evil.example/x" })?.href).toBeNull();
    expect(notificationRow({ ...base, href: "//evil.example/x" })?.href).toBeNull();
    expect(notificationRow({ ...base, href: "/ops/pipeline" })?.href).toBe("/ops/pipeline");
  });

  it("carries what it is about, so a page can find it again", () => {
    const row = notificationRow({ ...base, about: { type: "booking", id: "b1" } });
    expect(row?.about_type).toBe("booking");
    expect(row?.about_id).toBe("b1");
  });
});

describe("where the office should land", () => {
  it("sends them to the ops copy of a booking, not the trekker's page", () => {
    // /notifications lets any signed-in account open a row, and /trips/:id
    // matches on trekker_id — so the trekker link is a dead end for ops.
    expect(opsHref({ type: "booking", id: "b1" })).toBe("/ops/bookings/b1");
  });

  it("sends them to the board for a request, which has no page of its own", () => {
    expect(opsHref({ type: "enquiry", id: "e1" })).toBe("/ops/pipeline");
  });

  it("has nowhere to send them for a thing with no ops page", () => {
    expect(opsHref({ type: "review", id: "r1" })).toBeNull();
    expect(opsHref(null)).toBeNull();
  });
});

describe("who the office is", () => {
  it("does not tell the same person twice when a guide is also on the ops team", () => {
    // The two rows carry different links, so they cannot be merged — the
    // office copy is the one that goes, because the guide's is more useful.
    expect(recipientsFor(["ops1", "guide1"], ["guide1"])).toEqual(["ops1"]);
  });

  it("collapses a duplicate id", () => {
    expect(recipientsFor(["ops1", "ops1", "ops2"], [])).toEqual(["ops1", "ops2"]);
  });

  it("is empty when everybody has already been told", () => {
    expect(recipientsFor(["ops1"], ["ops1"])).toEqual([]);
  });

  it("is empty when nobody is on the ops team, rather than throwing", () => {
    expect(recipientsFor([], [])).toEqual([]);
  });
});
