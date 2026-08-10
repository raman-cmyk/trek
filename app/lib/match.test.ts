import { describe, it, expect } from "vitest";
import { rankGuides, scoreGuide, type GuideFacts, type OfferingFact } from "./match";

const ebc: OfferingFact = {
  id: "o1", slug: "ebc", kind: "trek", title: "EBC classic", days: 14,
  region: "Khumbu", difficulty: "moderate", seasonMonths: [3, 4, 5, 10, 11],
  cheapestUsdCents: 90000, fromUsdCents: 110000,
};
const annapurna: OfferingFact = {
  id: "o2", slug: "ac", kind: "trek", title: "Annapurna Circuit", days: 12,
  region: "Annapurna", difficulty: "moderate", seasonMonths: [3, 4, 10, 11],
  cheapestUsdCents: 60000, fromUsdCents: 70000,
};

function guide(over: Partial<GuideFacts>): GuideFacts {
  return {
    guideId: "g", tier: 1, rating: null, reviewCount: 0, porterWelfare: false,
    medianResponseMins: null, languages: [], openDaysByMonth: {}, offerings: [],
    ...over,
  };
}

describe("guide matcher", () => {
  it("region + season + availability beats a better-rated guide elsewhere", () => {
    const khumbuGuide = guide({
      guideId: "khumbu", offerings: [ebc], openDaysByMonth: { 10: 20 },
    });
    const starGuide = guide({
      guideId: "star", tier: 3, rating: 5, reviewCount: 40, offerings: [annapurna],
    });
    const ranked = rankGuides([khumbuGuide, starGuide], {
      region: "Khumbu", month: 10, groupSize: 2,
    });
    expect(ranked[0].guideId).toBe("khumbu");
    expect(ranked[0].reasons.join(" ")).toContain("Khumbu");
    expect(ranked[0].reasons.join(" ")).toContain("October");
  });

  it("budget reason cites the recomposed floor price", () => {
    const g = guide({ offerings: [annapurna] });
    const r = scoreGuide(g, { budgetUsdCents: 65000, groupSize: 2 });
    expect(r.reasons.join(" ")).toContain("$600");
    expect(r.bestOffering?.slug).toBe("ac");
  });

  it("over-budget offerings earn no budget points", () => {
    const g = guide({ offerings: [ebc] });
    const r = scoreGuide(g, { budgetUsdCents: 50000, groupSize: 2 });
    expect(r.reasons.join(" ")).not.toContain("budget");
  });

  it("language proficiency is worth more when fluent", () => {
    const fluent = guide({ guideId: "f", languages: [{ language: "German", proficiency: "fluent" }] });
    const basic = guide({ guideId: "b", languages: [{ language: "German", proficiency: "basic" }] });
    const ranked = rankGuides([basic, fluent], { language: "German", groupSize: 1 });
    expect(ranked[0].guideId).toBe("f");
    expect(ranked[0].reasons.join(" ")).toContain("German");
  });

  it("a specific query drops guides with nothing to say", () => {
    const noSignal = guide({ guideId: "none" });
    const some = guide({ guideId: "some", offerings: [ebc] });
    const ranked = rankGuides([noSignal, some], { region: "Khumbu", groupSize: 1 });
    expect(ranked.map((r) => r.guideId)).toEqual(["some"]);
  });

  it("an open query keeps everyone, ordered by track record", () => {
    const newer = guide({ guideId: "new" });
    const veteran = guide({ guideId: "vet", tier: 3, rating: 4.9, reviewCount: 12 });
    const ranked = rankGuides([newer, veteran], { groupSize: 1 });
    expect(ranked.map((r) => r.guideId)).toEqual(["vet", "new"]);
  });
});
