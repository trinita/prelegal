import { describe, expect, it } from "vitest";
import {
  defaultValues,
  isPositiveNumber,
  outstandingRequirements,
  US_STATES,
  type MndaValues,
} from "./fields";

function completed(overrides: Partial<MndaValues> = {}): MndaValues {
  return {
    ...defaultValues(),
    effectiveDate: "2026-03-15",
    governingLaw: "Delaware",
    jurisdiction: "New Castle, DE",
    partyOne: {
      printName: "Ada",
      title: "CEO",
      company: "Acme",
      noticeAddress: "ada@example.com",
    },
    partyTwo: {
      printName: "Alan",
      title: "CTO",
      company: "Globex",
      noticeAddress: "alan@example.com",
    },
    ...overrides,
  };
}

describe("isPositiveNumber", () => {
  it("accepts positive numbers", () => {
    expect(isPositiveNumber("1")).toBe(true);
    expect(isPositiveNumber("2.5")).toBe(true);
  });

  it("rejects zero, negatives, blanks and non-numbers", () => {
    for (const value of ["0", "-1", "", "   ", "abc", "1abc", "Infinity"]) {
      expect(isPositiveNumber(value), `expected ${JSON.stringify(value)} to be rejected`).toBe(false);
    }
  });
});

describe("defaultValues", () => {
  it("starts from the template's own defaults, not empty text", () => {
    expect(defaultValues().purpose).toContain("Evaluating whether");
    expect(defaultValues().mndaTermYears).toBe("1");
    expect(defaultValues().confidentialityYears).toBe("1");
  });

  it("returns a fresh object each time, so drafts cannot share state", () => {
    const a = defaultValues();
    a.partyOne.company = "Changed";
    expect(defaultValues().partyOne.company).toBe("");
  });
});

describe("outstandingRequirements", () => {
  it("reports nothing outstanding for a completed agreement", () => {
    expect(outstandingRequirements(completed())).toEqual([]);
  });

  it("lists what is still missing on a fresh form", () => {
    const outstanding = outstandingRequirements(defaultValues());

    expect(outstanding).toContain("Effective date");
    expect(outstanding).toContain("Governing law");
    expect(outstanding).toContain("Party 1 company");
    // Purpose and both term lengths carry template defaults.
    expect(outstanding).not.toContain("Purpose");
    expect(outstanding).not.toContain("MNDA term length");
  });

  it("treats whitespace-only entries as missing", () => {
    expect(outstandingRequirements(completed({ governingLaw: "   " }))).toContain(
      "Governing law",
    );
  });

  it("does not require a year count when the alternative is chosen", () => {
    const values = completed({ mndaTermType: "untilTerminated", mndaTermYears: "" });
    expect(outstandingRequirements(values)).not.toContain("MNDA term length");
  });

  it("requires a valid year count when years are chosen", () => {
    const values = completed({ mndaTermType: "expires", mndaTermYears: "0" });
    expect(outstandingRequirements(values)).toContain("MNDA term length");
  });

  it("does not require confidentiality years in perpetuity", () => {
    const values = completed({
      confidentialityTermType: "perpetual",
      confidentialityYears: "",
    });
    expect(outstandingRequirements(values)).not.toContain("Term of confidentiality");
  });

  it("requires a notice address for both parties", () => {
    const values = completed({
      partyTwo: { printName: "Alan", title: "CTO", company: "Globex", noticeAddress: "" },
    });
    expect(outstandingRequirements(values)).toContain("Party 2 notice address");
  });
});

describe("US_STATES", () => {
  it("covers the fifty states plus DC", () => {
    expect(US_STATES).toHaveLength(51);
    expect(US_STATES).toContain("Delaware");
    expect(US_STATES).toContain("District of Columbia");
    expect(new Set(US_STATES).size).toBe(US_STATES.length);
  });
});
