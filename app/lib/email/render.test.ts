import { describe, expect, it } from "vitest";
import { renderEmail } from "./render";

const base = {
  postalAddress: "Trek · Thamel, Kathmandu, Nepal",
  siteUrl: "https://guidesofnepal.com",
};

describe("renderEmail", () => {
  it("puts the same words in the HTML and the text", () => {
    const { html, text } = renderEmail({
      ...base,
      content: {
        preheader: "Your deposit is in",
        heading: "Deposit received",
        blocks: [{ p: "Pemba has your dates." }],
      },
    });
    expect(html).toContain("Deposit received");
    expect(html).toContain("Pemba has your dates.");
    expect(text).toContain("Deposit received");
    expect(text).toContain("Pemba has your dates.");
  });

  it("escapes content rather than letting it become markup", () => {
    const { html } = renderEmail({
      ...base,
      content: {
        preheader: "x",
        heading: "Hi",
        blocks: [{ p: '<script>alert("x")</script> & "quotes"' }],
      },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("shows an unsubscribe link only when one is given", () => {
    const withLink = renderEmail({
      ...base,
      content: { preheader: "x", heading: "H", blocks: [] },
      unsubscribeUrl: "https://guidesofnepal.com/email/unsubscribe/abc",
    });
    expect(withLink.html).toContain("/email/unsubscribe/abc");
    expect(withLink.text).toContain("/email/unsubscribe/abc");

    // Transactional mail must not offer to stop something we would send anyway.
    const without = renderEmail({
      ...base,
      content: { preheader: "x", heading: "H", blocks: [] },
    });
    expect(without.html).not.toContain("/email/unsubscribe/");
    expect(without.html).toContain("about your trip");
  });

  it("always carries a postal address", () => {
    const { html, text } = renderEmail({
      ...base,
      content: { preheader: "x", heading: "H", blocks: [] },
    });
    expect(html).toContain("Kathmandu");
    expect(text).toContain("Kathmandu");
  });

  it("renders every block type", () => {
    const { html, text } = renderEmail({
      ...base,
      content: {
        preheader: "x",
        heading: "H",
        blocks: [
          { h: "Your trip" },
          { facts: [["Route", "Everest Base Camp"]] },
          { list: ["Bring boots", "Bring a jacket"] },
          { button: { label: "See it", url: "https://x.test/t" } },
        ],
      },
    });
    for (const s of ["Your trip", "Everest Base Camp", "Bring boots", "See it", "https://x.test/t"]) {
      expect(html).toContain(s);
    }
    expect(text).toContain("Bring boots");
    expect(text).toContain("https://x.test/t");
  });
});
