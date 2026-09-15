import { describe, expect, it } from "vitest";
import { auditNote, checkPassword, MIN_PASSWORD } from "./admin-password";

describe("checkPassword", () => {
  it("accepts something a person could actually say down a phone line", () => {
    expect(checkPassword("Namche-Bakery-77")).toBeNull();
  });

  it("rejects anything short", () => {
    expect(checkPassword("abc")?.message).toContain(`${MIN_PASSWORD} characters`);
    expect(checkPassword("")).not.toBeNull();
  });

  it("rejects an absurdly long one rather than handing it to the auth server", () => {
    expect(checkPassword("a1B!".repeat(80))).not.toBeNull();
  });

  it("catches a leading or trailing space, which is invisible in the box", () => {
    expect(checkPassword("Namche-Bakery-77 ")?.message).toContain("space");
    expect(checkPassword(" Namche-Bakery-77")?.message).toContain("space");
  });

  it("rejects the same few characters repeated", () => {
    expect(checkPassword("aaaaaaaaaaaa")).not.toBeNull();
    expect(checkPassword("ababababab")).not.toBeNull();
  });

  it("rejects the passwords an admin in a hurry reaches for", () => {
    for (const bad of ["password", "Password12", "letmein123", "changeme!!", "Welcome123"]) {
      expect(checkPassword(bad), bad).not.toBeNull();
    }
  });

  it("rejects the ones named after this company", () => {
    expect(checkPassword("GuidesOfNepal")).not.toBeNull();
    expect(checkPassword("nepal12345")).not.toBeNull();
  });

  it("does not reject a good password that merely contains a common word", () => {
    // "password" inside a longer phrase is fine; only the lazy shape is out.
    expect(checkPassword("my-password-is-a-yak")).toBeNull();
  });
});

describe("auditNote", () => {
  it("says what happened without ever seeing the secret", () => {
    expect(auditNote("password_set", "Pemba")).toBe("Set a chosen password for Pemba");
    expect(auditNote("password_generated", "Pemba")).toBe("Generated a new password for Pemba");
    expect(auditNote("entered_account", "Pemba")).toBe("Signed in as Pemba");
  });

  it("takes no password argument at all", () => {
    // A function that cannot see the secret cannot leak it. If this ever
    // grows a third parameter, that guarantee is gone.
    expect(auditNote.length).toBe(2);
  });
});
