import { describe, it, expect } from "vitest";
import { parseRoutesWalked, MAX_TIMES_WALKED } from "./guide-routes";

const json = (v: unknown) => JSON.stringify(v);

describe("what a guide claims to have walked", () => {
  it("takes a route and a count", () => {
    expect(parseRoutesWalked(json([{ routeId: "r1", times: 34 }]))).toEqual([
      { routeId: "r1", times: 34 },
    ]);
  });

  it("drops a route claimed twice — the table's key would reject the insert", () => {
    // A double tap must not lose the whole application.
    expect(
      parseRoutesWalked(json([
        { routeId: "r1", times: 34 },
        { routeId: "r1", times: 2 },
      ])),
    ).toEqual([{ routeId: "r1", times: 34 }]);
  });

  it("drops a row with no count rather than inventing one", () => {
    expect(parseRoutesWalked(json([{ routeId: "r1" }]))).toEqual([]);
    expect(parseRoutesWalked(json([{ routeId: "r1", times: 0 }]))).toEqual([]);
    expect(parseRoutesWalked(json([{ routeId: "r1", times: "many" }]))).toEqual([]);
  });

  it("caps a career at the number the database allows", () => {
    expect(parseRoutesWalked(json([{ routeId: "r1", times: 9999 }]))).toEqual([
      { routeId: "r1", times: MAX_TIMES_WALKED },
    ]);
  });

  it("survives anything that is not a list of claims", () => {
    expect(parseRoutesWalked("not json")).toEqual([]);
    expect(parseRoutesWalked(json({ routeId: "r1" }))).toEqual([]);
    expect(parseRoutesWalked(null)).toEqual([]);
    expect(parseRoutesWalked(json([null, 7, { routeId: "r1", times: 3 }]))).toEqual([
      { routeId: "r1", times: 3 },
    ]);
  });
});
