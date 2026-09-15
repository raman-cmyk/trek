import { describe, it, expect } from "vitest";
import { dedupeRails } from "./rails";

const g = (id: string) => ({ id });
const id = (x: { id: string }) => x.id;

describe("a guide appears in one row", () => {
  it("gives a guide to the first row that wants them", () => {
    const rails = dedupeRails(
      [
        { key: "a", matched: [g("1"), g("2"), g("3"), g("4")] },
        { key: "b", matched: [g("1"), g("2"), g("5"), g("6"), g("7")] },
      ],
      id,
    );
    expect(rails[0].members.map(id)).toEqual(["1", "2", "3", "4"]);
    expect(rails[1].members.map(id)).toEqual(["5", "6", "7"]);
  });

  it("drops a row left too thin to be a real choice", () => {
    const rails = dedupeRails(
      [
        { key: "a", matched: [g("1"), g("2"), g("3")] },
        { key: "b", matched: [g("1"), g("2"), g("3"), g("4")] },
      ],
      id,
    );
    expect(rails.map((r) => r.key)).toEqual(["a"]);
  });

  it("keeps the intent's true size, not the row's", () => {
    const rails = dedupeRails(
      [{ key: "a", matched: Array.from({ length: 20 }, (_, i) => g(String(i))) }],
      id,
      { perRail: 8 },
    );
    expect(rails[0].members).toHaveLength(8);
    expect(rails[0].total).toBe(20);
  });

  it("holds the row cap", () => {
    const rails = dedupeRails(
      [{ key: "a", matched: Array.from({ length: 12 }, (_, i) => g(String(i))) }],
      id,
      { perRail: 4 },
    );
    expect(rails[0].members).toHaveLength(4);
  });

  it("returns nothing rather than empty rows", () => {
    expect(dedupeRails([{ key: "a", matched: [g("1")] }], id)).toEqual([]);
    expect(dedupeRails([], id)).toEqual([]);
  });
});
