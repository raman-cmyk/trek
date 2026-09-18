import { describe, it, expect } from "vitest";
import {
  credentialsMailto,
  credentialsMessage,
  supportLink,
  waNumber,
  whatsappLink,
} from "./handover";

const creds = {
  name: "pratik paudyal",
  email: "pratik@example.com",
  password: "Anapurna-4412",
  loginUrl: "https://guidesofnepal.com/g/login",
};

describe("the number WhatsApp wants", () => {
  it("strips everything that is not a digit", () => {
    expect(waNumber("+977 9861 322 075")).toBe("9779861322075");
    expect(waNumber("977-9801204530")).toBe("9779801204530");
  });

  it("adds Nepal's code to a ten-digit mobile typed without it", () => {
    // How every guide writes their own number down.
    expect(waNumber("9861322075")).toBe("9779861322075");
  });

  it("leaves a foreign number alone", () => {
    expect(waNumber("+44 7700 900123")).toBe("447700900123");
  });

  it("has no link to give for something that is not a number", () => {
    expect(waNumber("")).toBeNull();
    expect(waNumber("1234")).toBeNull();
    expect(waNumber(null)).toBeNull();
    expect(whatsappLink("", "hello")).toBeNull();
  });
});

describe("the message", () => {
  const text = credentialsMessage(creds);

  it("uses their first name, not their full one", () => {
    expect(text.startsWith("Namaste pratik")).toBe(true);
  });

  it("carries the three things a hand-typed message forgets", () => {
    expect(text).toContain("temporary");
    expect(text).toContain("change it");
    expect(text).toContain("delete this message");
  });

  it("carries what they actually need to sign in", () => {
    expect(text).toContain("pratik@example.com");
    expect(text).toContain("Anapurna-4412");
    expect(text).toContain("https://guidesofnepal.com/g/login");
  });

  it("does not print an empty email line for somebody who has none", () => {
    // Half the guides here have a phone and no inbox.
    const noEmail = credentialsMessage({ ...creds, email: null });
    expect(noEmail).not.toContain("Email:");
    expect(noEmail).toContain("Anapurna-4412");
  });

  it("still says something civil when there is no name at all", () => {
    expect(credentialsMessage({ ...creds, name: "" }).startsWith("Namaste there")).toBe(true);
  });
});

describe("the links", () => {
  it("builds a wa.me link with the message in it", () => {
    const link = whatsappLink("9861322075", "hello there");
    expect(link).toBe("https://wa.me/9779861322075?text=hello%20there");
  });

  it("has no mailto for somebody with no address", () => {
    expect(credentialsMailto({ ...creds, email: null })).toBeNull();
    expect(credentialsMailto(creds)?.startsWith("mailto:")).toBe(true);
  });
});

describe("the guide's way to a human", () => {
  it("opens a chat that already says who it is", () => {
    const link = supportLink("9779801234567", { name: "Pemba Sherpa" });
    expect(link).toContain("wa.me/9779801234567");
    expect(decodeURIComponent(link!)).toContain("Pemba");
  });

  it("carries what it is about when there is something to say", () => {
    const link = supportLink("9779801234567", { name: "Pemba", about: "Lukla flight" });
    expect(decodeURIComponent(link!)).toContain("Lukla flight");
  });

  it("draws nothing when no support number is configured", () => {
    // A support button that opens nothing is worse than no button.
    expect(supportLink(null, { name: "Pemba" })).toBeNull();
    expect(supportLink("", {})).toBeNull();
  });
});
