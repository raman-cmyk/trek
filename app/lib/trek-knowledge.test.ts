import { describe, expect, it } from "vitest";
import {
  altitudeBand,
  isRestricted,
  knowBeforeYouGo,
  packingList,
  permitTotalUsdCents,
  type RouteFacts,
} from "./trek-knowledge";

const ebc: RouteFacts = {
  name: "Everest Base Camp",
  region: "Khumbu",
  maxAltitudeM: 5644,
  days: 14,
  permits: [
    { name: "Sagarmatha National Park Entry", usdCents: 2300 },
    { name: "Khumbu Pasang Lhamu Rural Municipality Fee", usdCents: 1500 },
  ],
};
const poonHill: RouteFacts = {
  name: "Poon Hill",
  region: "Annapurna",
  maxAltitudeM: 3210,
  days: 5,
  permits: [{ name: "Annapurna Conservation Area Permit (ACAP)", usdCents: 2300 }],
};
const helambu: RouteFacts = { name: "Helambu", region: "Langtang", maxAltitudeM: 2500, days: 6, permits: [] };
const manaslu: RouteFacts = {
  name: "Manaslu Circuit",
  region: "Manaslu",
  maxAltitudeM: 5106,
  days: 14,
  permits: [{ name: "Manaslu Restricted Area Permit", usdCents: 10000 }],
};

const bodyOf = (r: RouteFacts, id: string) => {
  const s = knowBeforeYouGo(r).find((x) => x.id === id);
  return [...(s?.body ?? []), ...(s?.bullets ?? [])].join(" ");
};

describe("altitudeBand", () => {
  it("uses the bands altitude medicine uses", () => {
    expect(altitudeBand(2400)).toBe("low");
    expect(altitudeBand(3210)).toBe("high");
    expect(altitudeBand(4410)).toBe("very-high");
    expect(altitudeBand(5644)).toBe("extreme");
  });

  it("treats a missing altitude as low rather than guessing high", () => {
    expect(altitudeBand(null)).toBe("low");
    expect(altitudeBand(undefined)).toBe("low");
  });
});

describe("permits", () => {
  it("adds them up, which is the number people search for", () => {
    expect(permitTotalUsdCents(ebc.permits)).toBe(3800);
    expect(permitTotalUsdCents([])).toBe(0);
  });

  it("knows a restricted area by its permit", () => {
    expect(isRestricted(manaslu.permits)).toBe(true);
    expect(isRestricted(ebc.permits)).toBe(false);
  });
});

describe("knowBeforeYouGo", () => {
  it("answers the questions the competitors answer and we did not", () => {
    const ids = knowBeforeYouGo(ebc).map((s) => s.id);
    for (const id of [
      "altitude", "insurance", "rescue", "permits", "sleeping",
      "food", "money", "power", "porters", "tipping", "culture", "responsible",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("quotes this route's own altitude, not a generic one", () => {
    expect(bodyOf(ebc, "altitude")).toContain("5,644 m");
    expect(bodyOf(poonHill, "altitude")).toContain("3,210 m");
  });

  it("does not frighten a low walk with high-altitude advice", () => {
    // Helambu tops out at 2,500 m. Telling somebody to read up on HACE is
    // both wrong and the kind of padding that makes a page worthless.
    const body = bodyOf(helambu, "altitude");
    expect(body).toContain("below the height at which altitude sickness normally starts");
    expect(knowBeforeYouGo(helambu).map((s) => s.id)).not.toContain("rescue");
  });

  it("gives the real acclimatisation rule on a high walk", () => {
    const body = bodyOf(ebc, "altitude");
    expect(body).toContain("300–500 m");
    expect(body).toContain("go down");
  });

  it("names the permits and their total", () => {
    const body = bodyOf(ebc, "permits");
    expect(body).toContain("$38");
    expect(body).toContain("Sagarmatha National Park Entry");
  });

  it("explains a restricted area rather than just charging for it", () => {
    const body = bodyOf(manaslu, "permits");
    expect(body).toContain("restricted area");
    expect(body).toContain("minimum of two trekkers");
  });

  it("says what insurance has to cover, in metres", () => {
    expect(bodyOf(ebc, "insurance")).toContain("5,644 m");
    expect(bodyOf(ebc, "insurance")).toContain("helicopter");
  });

  it("tells people to go vegetarian high up, and not to bother low down", () => {
    expect(bodyOf(ebc, "food")).toContain("go vegetarian");
    expect(bodyOf(helambu, "food")).not.toContain("go vegetarian");
  });

  it("states the porter weight limit as a number", () => {
    expect(bodyOf(ebc, "porters")).toContain("20 kg");
  });

  it("is honest that tipping is optional and the wage is real", () => {
    const body = bodyOf(ebc, "tipping");
    expect(body).toContain("not compulsory");
    expect(body).toContain("keep in full");
  });

  it("names the region in the etiquette, so it is about somewhere", () => {
    expect(bodyOf(ebc, "culture")).toContain("Khumbu");
    expect(bodyOf(poonHill, "culture")).toContain("Annapurna");
  });

  it("gives every section a title and something to say", () => {
    for (const s of knowBeforeYouGo(ebc)) {
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.body.length).toBeGreaterThan(0);
      expect(s.glyph.length).toBeGreaterThan(0);
    }
  });

  it("survives a route we know almost nothing about", () => {
    const bare: RouteFacts = { name: "A walk", region: "Nepal", maxAltitudeM: null, days: null, permits: [] };
    expect(knowBeforeYouGo(bare).length).toBeGreaterThan(6);
  });
});

describe("packingList", () => {
  it("covers every category a person packs by", () => {
    const ids = packingList(ebc).map((g) => g.id);
    expect(ids).toEqual(["layers", "feet", "sleeping", "carry", "head", "health", "papers"]);
  });

  it("asks for a down jacket and a cold bag only when it is cold", () => {
    const high = JSON.stringify(packingList(ebc));
    const low = JSON.stringify(packingList(helambu));
    expect(high).toContain("down jacket");
    expect(high).toContain("−10 °C");
    // Telling somebody on a 2,500 m walk to buy a £300 jacket is telling them
    // to waste it.
    expect(low).not.toContain("−10 °C");
  });

  it("says what we lend, so nobody buys a jacket for one trek", () => {
    const sleeping = packingList(ebc).find((g) => g.id === "sleeping")!;
    expect(sleeping.note).toContain("We lend");
  });

  it("never leaves a group empty", () => {
    for (const g of packingList(helambu)) expect(g.items.length).toBeGreaterThan(2);
  });
});
