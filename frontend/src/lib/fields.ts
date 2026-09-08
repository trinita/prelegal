/**
 * The Mutual NDA cover page, described once.
 *
 * This schema mirrors the fill-in fields of `templates/mutual-nda-coverpage.md`
 * and is the only place they are defined. The form, the draft that is persisted
 * to localStorage, and the document renderer all read from here, so adding or
 * renaming a field is a single edit.
 */

/** US states, for the governing law choice. */
export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
] as const;

/** One signing party's details, as they appear in the cover page table. */
export interface Party {
  printName: string;
  title: string;
  company: string;
  noticeAddress: string;
}

export interface MndaValues {
  purpose: string;
  effectiveDate: string;
  /** "expires" pairs with mndaTermYears; "untilTerminated" ignores it. */
  mndaTermType: "expires" | "untilTerminated";
  mndaTermYears: string;
  /** "years" pairs with confidentialityYears; "perpetual" ignores it. */
  confidentialityTermType: "years" | "perpetual";
  confidentialityYears: string;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
  partyOne: Party;
  partyTwo: Party;
}

const emptyParty = (): Party => ({
  printName: "",
  title: "",
  company: "",
  noticeAddress: "",
});

/**
 * Starting values. The purpose and both term lengths carry the defaults printed
 * in the Common Paper template, so an untouched form still produces the
 * standard agreement rather than a document full of gaps.
 */
export const defaultValues = (): MndaValues => ({
  purpose: "Evaluating whether to enter into a business relationship with the other party.",
  effectiveDate: "",
  mndaTermType: "expires",
  mndaTermYears: "1",
  confidentialityTermType: "years",
  confidentialityYears: "1",
  governingLaw: "",
  jurisdiction: "",
  modifications: "",
  partyOne: emptyParty(),
  partyTwo: emptyParty(),
});

/** Fields that must be filled before the document is fit to sign. */
export interface Requirement {
  label: string;
  isMet: (values: MndaValues) => boolean;
}

const filled = (value: string) => value.trim() !== "";

export const REQUIREMENTS: Requirement[] = [
  { label: "Purpose", isMet: (v) => filled(v.purpose) },
  { label: "Effective date", isMet: (v) => filled(v.effectiveDate) },
  {
    label: "MNDA term length",
    isMet: (v) => v.mndaTermType === "untilTerminated" || isPositiveNumber(v.mndaTermYears),
  },
  {
    label: "Term of confidentiality",
    isMet: (v) => v.confidentialityTermType === "perpetual" || isPositiveNumber(v.confidentialityYears),
  },
  { label: "Governing law", isMet: (v) => filled(v.governingLaw) },
  { label: "Jurisdiction", isMet: (v) => filled(v.jurisdiction) },
  { label: "Party 1 company", isMet: (v) => filled(v.partyOne.company) },
  { label: "Party 1 signatory name", isMet: (v) => filled(v.partyOne.printName) },
  { label: "Party 1 notice address", isMet: (v) => filled(v.partyOne.noticeAddress) },
  { label: "Party 2 company", isMet: (v) => filled(v.partyTwo.company) },
  { label: "Party 2 signatory name", isMet: (v) => filled(v.partyTwo.printName) },
  { label: "Party 2 notice address", isMet: (v) => filled(v.partyTwo.noticeAddress) },
];

export function isPositiveNumber(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

/** Requirements not yet satisfied, in schema order. */
export function outstandingRequirements(values: MndaValues): string[] {
  return REQUIREMENTS.filter((r) => !r.isMet(values)).map((r) => r.label);
}
