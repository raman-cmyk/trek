import { describe, it, expect } from "vitest";
import { renderTemplate } from "./contracts.server";

describe("contract template rendering", () => {
  it("fills known placeholders and tolerates whitespace", () => {
    const body = "Guide {{guide_name}} for {{ offering_title }} — fee {{guide_fee}}.";
    const out = renderTemplate(body, {
      guide_name: "Pemba Sherpa",
      offering_title: "Everest Base Camp",
      guide_fee: "$1,260",
    });
    expect(out).toBe("Guide Pemba Sherpa for Everest Base Camp — fee $1,260.");
  });

  it("leaves unknown placeholders blank rather than printing the token", () => {
    expect(renderTemplate("Hi {{missing}}!", {})).toBe("Hi !");
  });

  it("is a no-op on text without placeholders", () => {
    expect(renderTemplate("No tokens here.", { a: "b" })).toBe("No tokens here.");
  });
});
