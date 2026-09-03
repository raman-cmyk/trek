import { describe, expect, it } from "vitest";
import { parseLanguages } from "./guide-languages";

describe("parseLanguages", () => {
  it("keeps a well-formed pair", () => {
    expect(
      parseLanguages(JSON.stringify([{ language: "Nepali", proficiency: "native" }])),
    ).toEqual([{ language: "Nepali", proficiency: "native" }]);
  });

  it("drops a language that is not on the list", () => {
    expect(
      parseLanguages(
        JSON.stringify([
          { language: "Klingon", proficiency: "fluent" },
          { language: "German", proficiency: "basic" },
        ]),
      ),
    ).toEqual([{ language: "German", proficiency: "basic" }]);
  });

  it("drops a proficiency the column would reject", () => {
    expect(
      parseLanguages(JSON.stringify([{ language: "English", proficiency: "perfect" }])),
    ).toEqual([]);
  });

  it("collapses duplicates — the primary key would reject the batch", () => {
    expect(
      parseLanguages(
        JSON.stringify([
          { language: "Nepali", proficiency: "native" },
          { language: "Nepali", proficiency: "basic" },
        ]),
      ),
    ).toEqual([{ language: "Nepali", proficiency: "native" }]);
  });

  it("survives junk instead of throwing into the application", () => {
    expect(parseLanguages("not json")).toEqual([]);
    expect(parseLanguages(JSON.stringify({ language: "Nepali" }))).toEqual([]);
    expect(parseLanguages("")).toEqual([]);
    expect(parseLanguages(undefined)).toEqual([]);
  });
});
