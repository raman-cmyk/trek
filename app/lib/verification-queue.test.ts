import { describe, it, expect } from "vitest";
import {
  DOC_STAGES,
  GUIDE_STAGES,
  checkTally,
  docMatchesStage,
  docState,
  docStage,
  docTypeLabel,
  guideBlocker,
  guideStage,
  guideStatusLabel,
  validateRejection,
} from "./verification-queue";

const label = (t: string) => ({ licence: "Trekking licence", phone: "Phone verified" }[t] ?? t);

describe("the guide stages", () => {
  it("default to the ones waiting on the office", () => {
    expect(guideStage(null).key).toBe("waiting");
    expect(guideStage("nonsense").key).toBe("waiting");
    expect(guideStage("waiting").match).toEqual(["applied", "in_review"]);
  });
  it("can reach a verified or rejected guide, which the old queue could not", () => {
    expect(guideStage("verified").match).toEqual(["verified"]);
    expect(guideStage("rejected").match).toContain("removed");
    expect(GUIDE_STAGES.find((s) => s.key === "all")!.match).toHaveLength(5);
  });
  it("prints a status the way the office says it", () => {
    expect(guideStatusLabel("in_review")).toBe("In review");
    expect(guideStatusLabel("removed")).toBe("Rejected");
    expect(guideStatusLabel("applied")).toBe("Applied");
  });
});

describe("a guide's checks, tallied", () => {
  const checks = [
    { check_type: "licence", status: "passed" },
    { check_type: "id_match", status: "passed" },
    { check_type: "phone", status: "pending" },
    { check_type: "police_cert", status: "failed" },
    { check_type: "insurance", status: "not_required" },
  ];

  it("counts passed, failed and still-pending", () => {
    expect(checkTally(checks)).toEqual({
      passed: 2,
      failed: 1,
      pending: 1,
      total: 5,
      complete: false,
    });
  });

  it("treats 'not needed' as finished, so a reviewed guide is not stuck at 5/6", () => {
    const done = [
      { check_type: "licence", status: "passed" },
      { check_type: "insurance", status: "not_required" },
    ];
    expect(checkTally(done).complete).toBe(true);
    expect(checkTally(done).pending).toBe(0);
  });

  it("counts an expired certificate as a problem, not as pending", () => {
    const t = checkTally([{ check_type: "first_aid", status: "expired" }]);
    expect(t.failed).toBe(1);
    expect(t.pending).toBe(0);
  });

  it("has nothing to say about a guide with no checks", () => {
    expect(checkTally([]).complete).toBe(false);
  });

  it("names the problem before the waiting", () => {
    expect(guideBlocker(checks, label)).toBe("police_cert — not passed");
    expect(
      guideBlocker([{ check_type: "phone", status: "pending" }], label),
    ).toBe("Waiting on Phone verified");
    expect(guideBlocker([{ check_type: "licence", status: "passed" }], label)).toBeNull();
  });
});

describe("a trekker's document", () => {
  it("is waiting until somebody looks", () => {
    expect(docState({ verified_at: null, rejected_at: null })).toBe("unverified");
  });
  it("is verified, or rejected", () => {
    expect(docState({ verified_at: "2026-09-01T00:00:00Z", rejected_at: null })).toBe("verified");
    expect(docState({ verified_at: null, rejected_at: "2026-09-01T00:00:00Z" })).toBe("rejected");
  });
  it("takes whichever happened last, so a re-review sticks", () => {
    expect(
      docState({ verified_at: "2026-09-02T00:00:00Z", rejected_at: "2026-09-01T00:00:00Z" }),
    ).toBe("verified");
    expect(
      docState({ verified_at: "2026-09-01T00:00:00Z", rejected_at: "2026-09-02T00:00:00Z" }),
    ).toBe("rejected");
  });
  it("filters by stage, with everything as a way out", () => {
    const d = { verified_at: null, rejected_at: null };
    expect(docMatchesStage(d, "unverified")).toBe(true);
    expect(docMatchesStage(d, "verified")).toBe(false);
    expect(docMatchesStage(d, "all")).toBe(true);
    expect(docStage(null)).toBe("unverified");
    expect(docStage("rubbish")).toBe("unverified");
    expect(DOC_STAGES.map((s) => s.key)).toEqual(["unverified", "verified", "rejected", "all"]);
  });
  it("is named in words, not in column values", () => {
    expect(docTypeLabel("passport")).toBe("Passport page");
    expect(docTypeLabel("insurance")).toBe("Insurance certificate");
  });
});

describe("turning a document down", () => {
  it("needs a reason the trekker can act on", () => {
    expect(validateRejection("")).toHaveProperty("error");
    expect(validateRejection("no")).toHaveProperty("error");
    expect(validateRejection("   ")).toHaveProperty("error");
  });
  it("keeps the reason, trimmed and capped", () => {
    expect(validateRejection("  Blurred — we cannot read the number.  ")).toEqual({
      reason: "Blurred — we cannot read the number.",
    });
    const long = validateRejection("x".repeat(400));
    expect("reason" in long && long.reason.length).toBe(300);
  });
});
