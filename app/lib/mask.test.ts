import { describe, it, expect } from "vitest";
import { maskMessage, containsContactInfo } from "./mask";

describe("maskMessage — phone numbers", () => {
  it("masks an international phone number and flags 'phone'", () => {
    const r = maskMessage("Call me on +977 9812345678 when you land");
    expect(r.rendered).toContain("[number hidden]");
    expect(r.rendered).not.toContain("9812345678");
    expect(r.flaggedReason).toBe("phone");
  });

  it("masks a spaced/dashed number", () => {
    const r = maskMessage("my cell is 415-555-2671");
    expect(r.rendered).toContain("[number hidden]");
    expect(r.flaggedReason).toBe("phone");
  });

  it("does NOT mask short numbers like dates or prices", () => {
    const r = maskMessage("Let's start Tue 14 Oct, the price is $360 for 12 days");
    expect(r.rendered).toBe("Let's start Tue 14 Oct, the price is $360 for 12 days");
    expect(r.flaggedReason).toBeNull();
  });
});

describe("maskMessage — emails", () => {
  it("masks an email and flags 'email'", () => {
    const r = maskMessage("email me at pemba.sherpa@gmail.com please");
    expect(r.rendered).toContain("[email hidden]");
    expect(r.rendered).not.toContain("gmail.com");
    expect(r.flaggedReason).toBe("email");
  });
});

describe("maskMessage — off-platform keywords", () => {
  it("flags whatsapp as platform_bypass", () => {
    expect(maskMessage("add me on whatsapp").flaggedReason).toBe("platform_bypass");
  });
  it("flags viber, telegram, and 'directly'", () => {
    expect(maskMessage("I'm on Viber").flaggedReason).toBe("platform_bypass");
    expect(maskMessage("message me on Telegram").flaggedReason).toBe("platform_bypass");
    expect(maskMessage("let's arrange this directly").flaggedReason).toBe("platform_bypass");
  });
});

describe("flag precedence", () => {
  it("prefers phone over email over bypass when several appear", () => {
    const r = maskMessage("whatsapp me at pemba@x.com or +9779812345678");
    expect(r.flaggedReason).toBe("phone");
    expect(r.rendered).toContain("[email hidden]");
    expect(r.rendered).toContain("[number hidden]");
  });
  it("prefers email over bypass when no phone present", () => {
    expect(maskMessage("whatsapp: pemba@x.com").flaggedReason).toBe("email");
  });
});

describe("containsContactInfo", () => {
  it("is true when contact info or bypass keywords are present", () => {
    expect(containsContactInfo("call +9779812345678")).toBe(true);
    expect(containsContactInfo("a@b.com")).toBe(true);
    expect(containsContactInfo("whatsapp me")).toBe(true);
  });
  it("is false for clean messages", () => {
    expect(containsContactInfo("Looking forward to trekking with you in October!")).toBe(false);
  });
});
