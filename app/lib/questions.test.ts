import { describe, expect, it } from "vitest";
import {
  QUESTION_MAX,
  askedLine,
  hasContactDetails,
  sortWall,
  validateAnswer,
  validateQuestion,
} from "./questions";

describe("validateQuestion", () => {
  const ok = { name: "Marta", body: "How hard is the day over Larkya La really?" };

  it("accepts a real question", () => {
    expect(validateQuestion(ok)).toBeNull();
  });

  it("asks for a name so the answer can be addressed to somebody", () => {
    expect(validateQuestion({ ...ok, name: "  " })).toMatch(/first name/i);
  });

  it("refuses a one-word question", () => {
    expect(validateQuestion({ ...ok, body: "hard?" })).toMatch(/one full sentence/i);
  });

  it("refuses an essay, and says where to put it instead", () => {
    const long = "a".repeat(QUESTION_MAX + 1);
    expect(validateQuestion({ ...ok, body: long })).toMatch(/message the guide/i);
  });

  it("refuses contact details, because the answer is public", () => {
    expect(
      validateQuestion({ ...ok, body: "Can you email me at marta@example.com about dates?" }),
    ).toMatch(/phone numbers and email/i);
  });
});

describe("hasContactDetails", () => {
  it("catches an email address", () => {
    expect(hasContactDetails("write to me at a.b+c@mail.co.uk please")).toBe(true);
  });

  it("catches a phone number however it is spaced", () => {
    expect(hasContactDetails("call +977 980-000-0001")).toBe(true);
    expect(hasContactDetails("my number is 0044 7700 900123")).toBe(true);
  });

  it("catches the apps people move a conversation to", () => {
    expect(hasContactDetails("are you on whatsapp?")).toBe(true);
    expect(hasContactDetails("find me @marta.walks")).toBe(true);
  });

  it("leaves ordinary numbers alone", () => {
    expect(hasContactDetails("Is 5,644 m too high for a first trek?")).toBe(false);
    expect(hasContactDetails("We are 4 people walking 14 days in October 2026")).toBe(false);
  });
});

describe("validateAnswer", () => {
  it("accepts an answer", () => {
    expect(validateAnswer("Day nine, because you start at 3 a.m.")).toBeNull();
  });

  it("refuses an empty one", () => {
    expect(validateAnswer("   ")).toMatch(/write an answer/i);
  });
});

describe("sortWall", () => {
  const q = (helpful_count: number, answered_at: string, id: string) => ({
    helpful_count,
    answered_at,
    id,
  });

  it("puts the most helpful first", () => {
    const out = sortWall([q(1, "2026-01-01", "a"), q(9, "2026-01-01", "b")]);
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("breaks a tie with the newest, so a fresh answer is not buried", () => {
    const out = sortWall([q(0, "2026-01-01", "old"), q(0, "2026-06-01", "new")]);
    expect(out.map((x) => x.id)).toEqual(["new", "old"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [q(1, "2026-01-01", "a"), q(9, "2026-01-01", "b")];
    sortWall(input);
    expect(input.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("askedLine", () => {
  it("reads as a person and a month", () => {
    expect(
      askedLine({
        asker_first_name: "Marta",
        asker_country: "PL",
        created_at: "2026-06-14T09:00:00Z",
      }),
    ).toBe("Marta, PL · asked June 2026");
  });

  it("drops the country when there is not one", () => {
    expect(
      askedLine({
        asker_first_name: "Tom",
        asker_country: null,
        created_at: "2026-06-14T09:00:00Z",
      }),
    ).toBe("Tom · asked June 2026");
  });
});
