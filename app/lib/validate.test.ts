import { describe, it, expect } from "vitest";
import {
  INSURERS,
  insuranceProblems,
  insurerLabel,
  passportExpiryProblem,
  phoneProblem,
  policyNoProblem,
  resolveInsurer,
  travellerNameProblem,
} from "./validate";

describe("which insurer", () => {
  it("stores the list's own spelling, not whatever was typed", () => {
    const r = resolveInsurer("world_nomads", null);
    expect(r).toEqual({ ok: true, name: "World Nomads" });
  });

  it("is the whole point: 'wolrd nomads' can no longer be entered", () => {
    // Production holds "world nomads" (4) and "wolrd nomads" (4) — one company
    // split by one transposed letter. A picker is the only cure.
    const r = resolveInsurer("wolrd nomads", null);
    expect(r.ok).toBe(false);
  });

  it("insists on a name behind Other", () => {
    expect(resolveInsurer("other", "").ok).toBe(false);
    expect(resolveInsurer("other", "x").ok).toBe(false);
    expect(resolveInsurer("other", "Nepal Insurance Co")).toEqual({
      ok: true,
      name: "Nepal Insurance Co",
    });
  });

  it("does not accept one letter typed twelve times as an insurer", () => {
    expect(resolveInsurer("other", "aaaaaaaaaaaa").ok).toBe(false);
    expect(resolveInsurer("other", "xxx xxx").ok).toBe(false);
  });

  it("asks for a choice rather than assuming one", () => {
    expect(resolveInsurer(null, null).ok).toBe(false);
    expect(resolveInsurer("", null).ok).toBe(false);
  });

  it("keeps an escape hatch in the list, so nobody is blocked", () => {
    expect(INSURERS.some((i) => i.key === "other")).toBe(true);
    expect(insurerLabel("global_rescue")).toBe("Global Rescue");
  });
});

describe("policy number", () => {
  it("takes the shapes insurers actually use", () => {
    for (const v of ["WN-2026-8841", "GR/1188/AB", "884412", "A.1234.99", "ripcord_7781"]) {
      expect(policyNoProblem(v)).toBeNull();
    }
  });

  it("refuses the ones that are nobody's policy", () => {
    expect(policyNoProblem("")?.field).toBe("policy_no");
    expect(policyNoProblem("12")?.message).toContain("too short");
    expect(policyNoProblem("1111111")?.message).toContain("does not look like");
    expect(policyNoProblem("!!!!")?.message).toContain("letters, numbers");
    expect(policyNoProblem("x".repeat(41))?.message).toContain("too long");
  });
});

describe("passport expiry", () => {
  const tripEnd = "2027-02-28";

  it("wants six months beyond the last day of the trek", () => {
    expect(passportExpiryProblem("2027-08-28", tripEnd)).toBeNull();
    expect(passportExpiryProblem("2028-01-01", tripEnd)).toBeNull();
  });

  it("says so when it expires too soon", () => {
    const p = passportExpiryProblem("2027-05-01", tripEnd);
    expect(p?.message).toContain("6 months");
  });

  it("counts by the calendar, not in thirty-day lumps", () => {
    // 31 Aug is a day short of six months from 28 Feb only if you count days.
    expect(passportExpiryProblem("2027-08-27", tripEnd)?.message).toContain("6 months");
    expect(passportExpiryProblem("2027-08-28", tripEnd)).toBeNull();
  });

  it("is optional, and says nothing when it or the trip date is missing", () => {
    expect(passportExpiryProblem(null, tripEnd)).toBeNull();
    expect(passportExpiryProblem("2027-08-28", null)).toBeNull();
  });

  it("refuses something that is not a date", () => {
    expect(passportExpiryProblem("soon", tripEnd)?.message).toContain("as a date");
  });
});

describe("phone", () => {
  it("accepts what people write, in the shapes they write it", () => {
    for (const v of ["+977 9841 234 567", "9841234567", "+44 7700 900123", "(01) 4412345"]) {
      expect(phoneProblem(v)).toBeNull();
    }
  });

  it("refuses too few and too many digits, and nothing at all", () => {
    expect(phoneProblem("")?.field).toBe("phone");
    expect(phoneProblem("12345")?.message).toContain("too short");
    expect(phoneProblem("1".repeat(20))?.message).toContain("too long");
  });
});

describe("traveller name", () => {
  it("wants the passport name", () => {
    expect(travellerNameProblem("Odonell Brian")).toBeNull();
    expect(travellerNameProblem("José Ramírez")).toBeNull();
  });

  it("refuses an initial, a number, and an essay", () => {
    expect(travellerNameProblem("J")?.field).toBe("full_name");
    expect(travellerNameProblem("12345")?.message).toContain("letters");
    expect(travellerNameProblem("a".repeat(81))?.message).toContain("longer");
  });
});

describe("the whole insurance form at once", () => {
  it("reports every problem, not the first", () => {
    const problems = insuranceProblems({ provider: "", policyNo: "1" });
    expect(problems.map((p) => p.field).sort()).toEqual(["policy_no", "provider"]);
  });

  it("is silent when it is right", () => {
    expect(
      insuranceProblems({ provider: "world_nomads", policyNo: "WN-2026-8841" }),
    ).toEqual([]);
  });
});
