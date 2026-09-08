"use client";

import type { ChangeEvent } from "react";
import { US_STATES, isPositiveNumber, type MndaValues, type Party } from "@/lib/fields";

interface Props {
  values: MndaValues;
  onChange: (values: MndaValues) => void;
}

interface DurationFieldsetProps {
  legend: string;
  hint: string;
  /** Radio group name; must be unique within the form. */
  group: string;
  yearsSelected: boolean;
  onSelectYears: () => void;
  onSelectAlternative: () => void;
  yearsLabel: string;
  yearsAriaLabel: string;
  yearsTail: string;
  years: string;
  onYearsChange: (years: string) => void;
  alternativeLabel: string;
}

/**
 * Both durations on the cover page take the same shape: a number of years, or a
 * single alternative (running until terminated, or lasting in perpetuity). The
 * year input is disabled unless its own option is chosen, so the form cannot
 * suggest a value that the document will ignore.
 */
function DurationFieldset({
  legend,
  hint,
  group,
  yearsSelected,
  onSelectYears,
  onSelectAlternative,
  yearsLabel,
  yearsAriaLabel,
  yearsTail,
  years,
  onYearsChange,
  alternativeLabel,
}: DurationFieldsetProps) {
  const invalid = years.trim() !== "" && !isPositiveNumber(years);

  return (
    <fieldset>
      <legend>{legend}</legend>
      <span className="field-hint">{hint}</span>

      <div className="choice-row">
        <label className="radio">
          <input
            type="radio"
            name={group}
            checked={yearsSelected}
            onChange={onSelectYears}
          />
          <span>{yearsLabel}</span>
        </label>
        <input
          type="number"
          min="1"
          className="years"
          aria-label={yearsAriaLabel}
          aria-invalid={yearsSelected && invalid}
          disabled={!yearsSelected}
          value={years}
          onChange={(e) => onYearsChange(e.target.value)}
        />
        <span className="choice-tail">{yearsTail}</span>
      </div>

      <label className="radio">
        <input
          type="radio"
          name={group}
          checked={!yearsSelected}
          onChange={onSelectAlternative}
        />
        <span>{alternativeLabel}</span>
      </label>
    </fieldset>
  );
}

export default function NdaForm({ values, onChange }: Props) {
  const set = <K extends keyof MndaValues>(key: K, value: MndaValues[K]) =>
    onChange({ ...values, [key]: value });

  const setParty = (which: "partyOne" | "partyTwo", key: keyof Party, value: string) =>
    onChange({ ...values, [which]: { ...values[which], [key]: value } });

  return (
    <form className="form" onSubmit={(event) => event.preventDefault()}>
      <fieldset>
        <legend>Agreement</legend>

        <label className="field">
          <span className="field-label">Purpose</span>
          <span className="field-hint">How Confidential Information may be used</span>
          <textarea
            rows={2}
            value={values.purpose}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set("purpose", e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">Effective date</span>
          <input
            type="date"
            value={values.effectiveDate}
            onChange={(e) => set("effectiveDate", e.target.value)}
          />
        </label>
      </fieldset>

      <DurationFieldset
        legend="MNDA term"
        hint="The length of this MNDA"
        group="mndaTerm"
        yearsSelected={values.mndaTermType === "expires"}
        onSelectYears={() => set("mndaTermType", "expires")}
        onSelectAlternative={() => set("mndaTermType", "untilTerminated")}
        yearsLabel="Expires"
        yearsAriaLabel="MNDA term in years"
        yearsTail="year(s) from the effective date"
        years={values.mndaTermYears}
        onYearsChange={(years) => set("mndaTermYears", years)}
        alternativeLabel="Continues until terminated under the terms of the MNDA"
      />

      <DurationFieldset
        legend="Term of confidentiality"
        hint="How long Confidential Information is protected"
        group="confidentialityTerm"
        yearsSelected={values.confidentialityTermType === "years"}
        onSelectYears={() => set("confidentialityTermType", "years")}
        onSelectAlternative={() => set("confidentialityTermType", "perpetual")}
        yearsLabel="Protected for"
        yearsAriaLabel="Term of confidentiality in years"
        yearsTail="year(s), and trade secrets for as long as they qualify"
        years={values.confidentialityYears}
        onYearsChange={(years) => set("confidentialityYears", years)}
        alternativeLabel="In perpetuity"
      />

      <fieldset>
        <legend>Governing law &amp; jurisdiction</legend>

        <label className="field">
          <span className="field-label">Governing law</span>
          <select
            value={values.governingLaw}
            onChange={(e) => set("governingLaw", e.target.value)}
          >
            <option value="">Select a state…</option>
            {US_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Jurisdiction</span>
          <span className="field-hint">City or county and state, e.g. “New Castle, DE”</span>
          <input
            type="text"
            value={values.jurisdiction}
            onChange={(e) => set("jurisdiction", e.target.value)}
          />
        </label>
      </fieldset>

      {(["partyOne", "partyTwo"] as const).map((which, position) => (
        <fieldset key={which}>
          <legend>Party {position + 1}</legend>

          <label className="field">
            <span className="field-label">Company</span>
            <input
              type="text"
              value={values[which].company}
              onChange={(e) => setParty(which, "company", e.target.value)}
            />
          </label>

          <div className="field-pair">
            <label className="field">
              <span className="field-label">Signatory name</span>
              <input
                type="text"
                value={values[which].printName}
                onChange={(e) => setParty(which, "printName", e.target.value)}
              />
            </label>

            <label className="field">
              <span className="field-label">Title</span>
              <input
                type="text"
                value={values[which].title}
                onChange={(e) => setParty(which, "title", e.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Notice address</span>
            <span className="field-hint">Email or postal address</span>
            <input
              type="text"
              value={values[which].noticeAddress}
              onChange={(e) => setParty(which, "noticeAddress", e.target.value)}
            />
          </label>
        </fieldset>
      ))}

      <fieldset>
        <legend>Modifications</legend>
        <label className="field">
          <span className="field-hint">
            Any changes to the standard terms. Left blank, the document records “None.”
          </span>
          <textarea
            rows={3}
            value={values.modifications}
            onChange={(e) => set("modifications", e.target.value)}
          />
        </label>
      </fieldset>
    </form>
  );
}
