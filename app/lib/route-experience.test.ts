import { describe, expect, it } from "vitest";
import { parseRoutesWalked } from "~/components/RouteExperience";

const OK = new Set(["r1", "r2"]);

describe("parseRoutesWalked", () => {
  it("keeps a valid claim", () => {
    expect(parseRoutesWalked(JSON.stringify([{ routeId: "r1", timesWalked: 12 }]), OK)).toEqual([
      { routeId: "r1", timesWalked: 12 },
    ]);
  });

  it("drops a route that is not live", () => {
    expect(
      parseRoutesWalked(JSON.stringify([{ routeId: "nope", timesWalked: 3 }]), OK),
    ).toEqual([]);
  });

  it("clamps a count above the column's CHECK", () => {
    expect(
      parseRoutesWalked(JSON.stringify([{ routeId: "r1", timesWalked: 99999 }]), OK),
    ).toEqual([{ routeId: "r1", timesWalked: 500 }]);
  });

  it("drops zero, negative and non-numeric counts", () => {
    expect(
      parseRoutesWalked(
        JSON.stringify([
          { routeId: "r1", timesWalked: 0 },
          { routeId: "r2", timesWalked: "many" },
        ]),
        OK,
      ),
    ).toEqual([]);
  });

  it("collapses duplicate routes", () => {
    expect(
      parseRoutesWalked(
        JSON.stringify([
          { routeId: "r1", timesWalked: 4 },
          { routeId: "r1", timesWalked: 9 },
        ]),
        OK,
      ),
    ).toEqual([{ routeId: "r1", timesWalked: 4 }]);
  });

  it("survives junk", () => {
    expect(parseRoutesWalked("{{{", OK)).toEqual([]);
    expect(parseRoutesWalked("", OK)).toEqual([]);
  });
});
