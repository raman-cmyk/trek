import { describe, expect, it } from "vitest";
import {
  accountLabel,
  cleanPan,
  needsBankFields,
  panProblem,
  payoutLine,
  payoutProblems,
  payoutReady,
  whatIsMissing,
} from "./payout";

const esewa = {
  method: "esewa",
  account: "9801234567",
  accountName: "Pemba Sherpa",
};

const bank = {
  method: "bank",
  account: "00901010012345",
  accountName: "Binod Tamang",
  bankName: "NIC Asia",
  branch: "Thamel",
};

describe("payoutProblems", () => {
  it("is quiet when a wallet is complete", () => {
    expect(payoutProblems(esewa)).toEqual([]);
    expect(payoutReady(esewa)).toBe(true);
  });

  it("is quiet when a bank account is complete", () => {
    expect(payoutProblems(bank)).toEqual([]);
  });

  it("catches the guide who never chose a method", () => {
    // Four of fifty-six guides on file are in exactly this state, because the
    // old dropdown had no empty option and looked like eSewa was chosen.
    expect(payoutProblems({ ...esewa, method: "" })).toContain(
      "No payout method chosen.",
    );
  });

  it("refuses a method we cannot pay to", () => {
    expect(payoutProblems({ ...esewa, method: "paypal" })).toContain(
      "That payout method isn't one we can pay to.",
    );
  });

  it("will not let a bank account through without a bank", () => {
    // An account number with no bank name is not a payment instruction.
    expect(payoutProblems({ ...bank, bankName: "" })).toEqual([
      "No bank name — a bank account number alone can't be paid.",
    ]);
  });

  it("does not ask a wallet for a bank name", () => {
    expect(payoutProblems({ ...esewa, bankName: "" })).toEqual([]);
    expect(needsBankFields("esewa")).toBe(false);
    expect(needsBankFields("bank")).toBe(true);
  });

  it("insists on a name, because a number without one is a bounced transfer", () => {
    expect(payoutProblems({ ...esewa, accountName: "  " })).toEqual([
      "No name on the account.",
    ]);
  });

  it("rejects a number too short to be real", () => {
    expect(payoutProblems({ ...esewa, account: "123" })).toEqual([
      "That account number is too short to be real.",
    ]);
  });

  it("lists everything wrong at once, not the first thing", () => {
    // Someone fixing this on a phone should not have to save four times to
    // discover four problems.
    expect(payoutProblems({})).toHaveLength(3);
  });
});

describe("whatIsMissing", () => {
  it("is null when there is nothing to say", () => {
    expect(whatIsMissing(bank)).toBeNull();
  });

  it("is one sentence for a table cell", () => {
    expect(whatIsMissing({ method: "bank", account: "0090101001", accountName: "" })).toBe(
      "No name on the account. No bank name — a bank account number alone can't be paid.",
    );
  });
});

describe("accountLabel", () => {
  it("names the thing the guide is actually being asked for", () => {
    expect(accountLabel("esewa")).toBe("Your eSewa number");
    expect(accountLabel("khalti")).toBe("Your Khalti number");
    expect(accountLabel("bank")).toBe("Account number");
  });

  it("stays vague only while nothing is chosen", () => {
    expect(accountLabel(null)).toBe("Account or wallet number");
  });
});

describe("payoutLine", () => {
  it("reads as one line for whoever is making the transfer", () => {
    expect(payoutLine(esewa)).toBe("eSewa · 9801234567 · Pemba Sherpa");
  });

  it("carries the bank and branch when there is one", () => {
    expect(payoutLine(bank)).toBe(
      "Bank account · 00901010012345 · NIC Asia · Thamel · Binod Tamang",
    );
  });

  it("never renders an empty field as a gap or the word null", () => {
    expect(payoutLine({ method: "esewa", account: null, accountName: null })).toBe("eSewa");
    expect(payoutLine({})).toBe("Nothing on file");
  });
});

describe("panProblem", () => {
  it("accepts a nine-digit PAN", () => {
    expect(panProblem("301234567")).toBeNull();
  });

  it("accepts an empty one, because a PAN blocks nothing", () => {
    // It is a tax number, asked for after verification, and a guide who has
    // not got one yet is not in trouble.
    expect(panProblem("")).toBeNull();
    expect(panProblem("   ")).toBeNull();
  });

  it("refuses letters and dashes", () => {
    expect(panProblem("30-123-4567")).toBe("A PAN is digits only — no letters or dashes.");
  });

  it("refuses the wrong length", () => {
    expect(panProblem("3012345")).toBe("A Nepali PAN is nine digits.");
    expect(panProblem("3012345678")).toBe("A Nepali PAN is nine digits.");
  });
});

describe("cleanPan", () => {
  it("turns a cleared field into null rather than an empty string", () => {
    expect(cleanPan("  ")).toBeNull();
    expect(cleanPan(" 301234567 ")).toBe("301234567");
  });
});
