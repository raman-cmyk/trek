import { describe, expect, it } from "vitest";
import {
  accountRows,
  isSuperAdmin,
  loginPathFor,
  matchesAccount,
  newPassword,
  sinceLabel,
} from "./super-admin";

describe("isSuperAdmin", () => {
  it("is the founder, however the email is cased", () => {
    expect(isSuperAdmin("raman@greyemails.com")).toBe(true);
    expect(isSuperAdmin("  Raman@GreyEmails.com ")).toBe(true);
  });
  it("is nobody else, and not an empty email", () => {
    expect(isSuperAdmin("ops@greyemails.com")).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin("")).toBe(false);
  });
});

describe("accountRows", () => {
  const auth = [
    { id: "a", email: "a@x.com", created_at: "2026-01-01T00:00:00Z", last_sign_in_at: null },
    {
      id: "b",
      email: "b@x.com",
      created_at: "2026-02-01T00:00:00Z",
      last_sign_in_at: "2026-09-01T00:00:00Z",
      email_confirmed_at: "2026-02-01T00:00:00Z",
      app_metadata: { provider: "email", providers: ["email"] },
    },
    { id: "c", phone: "+9779800000000", created_at: "2026-03-01T00:00:00Z", last_sign_in_at: "2026-08-01T00:00:00Z" },
  ];
  const profiles = [
    { id: "b", role: "guide", full_name: "Pemba Sherpa" },
    { id: "c", role: "trekker", full_name: "" },
  ];

  it("joins profile to auth record and sorts by last sign-in, never-signed-in last", () => {
    const rows = accountRows(auth, profiles);
    expect(rows.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(rows[0]).toMatchObject({ name: "Pemba Sherpa", role: "guide", confirmed: true });
  });

  it("keeps an account with no profile, named from its email", () => {
    const a = accountRows(auth, profiles).find((r) => r.id === "a")!;
    expect(a.role).toBe("none");
    expect(a.name).toBe("a");
    expect(a.confirmed).toBe(false);
  });

  it("falls back to the phone as the name", () => {
    const c = accountRows(auth, profiles).find((r) => r.id === "c")!;
    expect(c.name).toBe("+9779800000000");
  });

  it("reads a ban only while it is still running", () => {
    const rows = accountRows(
      [
        { ...auth[0], banned_until: "2099-01-01T00:00:00Z" },
        { ...auth[1], banned_until: "2020-01-01T00:00:00Z" },
      ],
      [],
    );
    expect(rows.find((r) => r.id === "a")!.banned).toBe(true);
    expect(rows.find((r) => r.id === "b")!.banned).toBe(false);
  });
});

describe("matchesAccount", () => {
  const a = accountRows(
    [{ id: "b", email: "pemba@x.com", phone: "+977", created_at: "2026-02-01T00:00:00Z" }],
    [{ id: "b", role: "guide", full_name: "Pemba Sherpa" }],
  )[0];
  it("matches on name, email or phone, and everything on an empty query", () => {
    expect(matchesAccount(a, "sherpa")).toBe(true);
    expect(matchesAccount(a, "PEMBA@")).toBe(true);
    expect(matchesAccount(a, "+977")).toBe(true);
    expect(matchesAccount(a, "")).toBe(true);
    expect(matchesAccount(a, "tenzing")).toBe(false);
  });
});

describe("sinceLabel", () => {
  const now = Date.parse("2026-09-09T12:00:00Z");
  it("reads as a person would say it", () => {
    expect(sinceLabel(null, now)).toBe("Never");
    expect(sinceLabel("2026-09-09T11:59:30Z", now)).toBe("Just now");
    expect(sinceLabel("2026-09-09T11:20:00Z", now)).toBe("40 min ago");
    expect(sinceLabel("2026-09-09T09:00:00Z", now)).toBe("3h ago");
    expect(sinceLabel("2026-09-08T12:00:00Z", now)).toBe("1 day ago");
    expect(sinceLabel("2026-08-20T12:00:00Z", now)).toBe("20 days ago");
    expect(sinceLabel("2026-05-09T12:00:00Z", now)).toBe("4 months ago");
  });
});

describe("loginPathFor", () => {
  it("sends each role to its own door with the email filled in", () => {
    expect(loginPathFor("guide", "p@x.com")).toBe("/g/login?email=p%40x.com");
    expect(loginPathFor("ops", "o@x.com")).toBe("/ops/login?email=o%40x.com");
    expect(loginPathFor("trekker", "t@x.com")).toBe("/login?email=t%40x.com");
    expect(loginPathFor("none", null)).toBe("/login");
  });
});

describe("newPassword", () => {
  it("is three words and a four-digit number", () => {
    expect(newPassword()).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{4}$/);
  });
  it("is deterministic for a fixed source", () => {
    expect(newPassword(() => 0)).toBe("yak-yak-yak-1000");
  });
});
