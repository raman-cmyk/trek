import { describe, expect, it } from "vitest";
import {
  isPermanentBounce,
  providerIdOf,
  recipientOf,
  resendOutcome,
  verifySvixSignature,
} from "./resend-events";

const bounced = (type: string, subType?: string) => ({
  type: "email.bounced",
  data: { email_id: "re_1", to: ["walker@example.org"], bounce: { type, subType } },
});

describe("what a bounce means", () => {
  it("blocks an address that is permanently gone", () => {
    const out = resendOutcome(bounced("Permanent", "NoEmail"));
    expect(out.do).toBe("block");
    expect(out.do === "block" && out.reason).toBe("hard_bounce: NoEmail");
  });

  it("does not block somebody whose mailbox is merely full", () => {
    // A transient bounce is a bad afternoon, not a dead address. Blocking on
    // it would lock a trekker out of their own booking receipts.
    const out = resendOutcome(bounced("Transient", "MailboxFull"));
    expect(out.do).toBe("record");
    expect(out.do === "record" && out.status).toBe("failed");
    expect(out.do === "record" && out.detail).toBe("soft_bounce: MailboxFull");
  });

  it("treats an undetermined bounce as temporary, because guessing costs more", () => {
    expect(resendOutcome(bounced("Undetermined")).do).toBe("record");
  });

  it("reads the permanence flag whatever case it arrives in", () => {
    expect(isPermanentBounce({ type: "permanent" })).toBe(true);
    expect(isPermanentBounce({ type: "  PERMANENT " })).toBe(true);
    expect(isPermanentBounce({ type: "Transient" })).toBe(false);
    expect(isPermanentBounce(null)).toBe(false);
    expect(isPermanentBounce(undefined)).toBe(false);
  });

  it("still says something useful when the bounce carries no sub-type", () => {
    const out = resendOutcome(bounced("Permanent"));
    expect(out.do === "block" && out.reason).toBe("hard_bounce");
  });
});

describe("the other events", () => {
  it("blocks anyone who pressed the spam button", () => {
    const out = resendOutcome({ type: "email.complained", data: { to: ["a@b.com"] } });
    expect(out.do).toBe("block");
    expect(out.do === "block" && out.reason).toBe("spam_complaint");
  });

  it("records a delivery, which is the only proof mail is working", () => {
    const out = resendOutcome({ type: "email.delivered", data: { email_id: "re_2" } });
    expect(out).toEqual({ do: "record", status: "sent", detail: "delivered" });
  });

  it("leaves a delayed delivery alone rather than calling it a failure", () => {
    // A receiving server asking us to wait usually resolves itself. The test
    // email sent on the day this shipped sat delayed for half an hour and was
    // not a failure.
    expect(resendOutcome({ type: "email.delivery_delayed" }).do).toBe("ignore");
  });

  it("ignores opens and clicks, which are not our business here", () => {
    expect(resendOutcome({ type: "email.opened" }).do).toBe("ignore");
    expect(resendOutcome({ type: "email.clicked" }).do).toBe("ignore");
    expect(resendOutcome({ type: "email.sent" }).do).toBe("ignore");
  });

  it("ignores an event type it has never seen instead of guessing", () => {
    // Resend adds types over time. The cost of guessing wrong is blocking
    // somebody who paid us.
    expect(resendOutcome({ type: "email.something_new" }).do).toBe("ignore");
    expect(resendOutcome({}).do).toBe("ignore");
    expect(resendOutcome(null).do).toBe("ignore");
  });
});

describe("who and which message an event is about", () => {
  it("takes the first recipient, lower-cased", () => {
    expect(recipientOf({ data: { to: ["Walker@Example.ORG", "b@c.com"] } })).toBe(
      "walker@example.org",
    );
  });

  it("copes with a bare string instead of a list", () => {
    expect(recipientOf({ data: { to: "solo@b.com" } })).toBe("solo@b.com");
  });

  it("gives null rather than nonsense when there is no address", () => {
    expect(recipientOf({ data: { to: [] } })).toBeNull();
    expect(recipientOf({ data: { to: ["not-an-address"] } })).toBeNull();
    expect(recipientOf(null)).toBeNull();
  });

  it("finds the provider id that email_log rows are keyed by", () => {
    expect(providerIdOf({ data: { email_id: " re_9 " } })).toBe("re_9");
    expect(providerIdOf({ data: {} })).toBeNull();
    expect(providerIdOf(null)).toBeNull();
  });
});

/* A real signature, computed the way Svix computes one. */
const SECRET = "whsec_" + btoa("a-test-signing-key-of-some-length");
async function sign(id: string, ts: string, body: string): Promise<string> {
  const raw = atob(SECRET.replace(/^whsec_/, ""));
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  const key = await crypto.subtle.importKey(
    "raw", buf, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`),
  );
  let s = "";
  for (const b of new Uint8Array(mac)) s += String.fromCharCode(b);
  return btoa(s);
}

describe("proving a webhook really came from Resend", () => {
  const body = JSON.stringify({ type: "email.bounced" });
  const nowMs = 1_760_000_000_000;
  const ts = String(Math.floor(nowMs / 1000));

  it("accepts a correctly signed delivery", async () => {
    const sig = await sign("msg_1", ts, body);
    const ok = await verifySvixSignature(
      body, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, SECRET, { nowMs },
    );
    expect(ok).toBe(true);
  });

  it("accepts it when Svix is mid-rotation and sends several keys", async () => {
    const sig = await sign("msg_1", ts, body);
    const ok = await verifySvixSignature(
      body,
      { id: "msg_1", timestamp: ts, signature: `v1,ZmFrZQ== v1,${sig}` },
      SECRET,
      { nowMs },
    );
    expect(ok).toBe(true);
  });

  it("refuses a body that was altered after signing", async () => {
    const sig = await sign("msg_1", ts, body);
    const ok = await verifySvixSignature(
      body + " ", { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, SECRET, { nowMs },
    );
    expect(ok).toBe(false);
  });

  it("refuses a captured delivery replayed tomorrow", async () => {
    const sig = await sign("msg_1", ts, body);
    const ok = await verifySvixSignature(
      body,
      { id: "msg_1", timestamp: ts, signature: `v1,${sig}` },
      SECRET,
      { nowMs: nowMs + 86_400_000 },
    );
    expect(ok).toBe(false);
  });

  it("refuses anything missing, rather than interpreting it", async () => {
    const sig = await sign("msg_1", ts, body);
    const h = { id: "msg_1", timestamp: ts, signature: `v1,${sig}` };
    expect(await verifySvixSignature(body, { ...h, id: null }, SECRET, { nowMs })).toBe(false);
    expect(await verifySvixSignature(body, { ...h, timestamp: null }, SECRET, { nowMs })).toBe(false);
    expect(await verifySvixSignature(body, { ...h, signature: null }, SECRET, { nowMs })).toBe(false);
    expect(await verifySvixSignature(body, h, "", { nowMs })).toBe(false);
  });

  it("refuses a timestamp that is not a number, and an unsigned scheme", async () => {
    const sig = await sign("msg_1", ts, body);
    expect(
      await verifySvixSignature(body, { id: "msg_1", timestamp: "soon", signature: `v1,${sig}` }, SECRET, { nowMs }),
    ).toBe(false);
    expect(
      await verifySvixSignature(body, { id: "msg_1", timestamp: ts, signature: `v2,${sig}` }, SECRET, { nowMs }),
    ).toBe(false);
  });
});
