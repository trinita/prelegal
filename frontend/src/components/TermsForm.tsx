"use client";

/**
 * The fields of any document but the Mutual NDA.
 *
 * The MNDA has a hand-built form because its cover page has structure — two
 * parties, paired term choices. The other ten are a flat list of defined terms,
 * so one form driven by the catalogue serves all of them, and adding a document
 * needs no component at all.
 */
import { US_STATES } from "@/lib/fields";
import type { DocumentField, DocumentSpec, TermValues } from "@/lib/documents";

interface Props {
  document: DocumentSpec;
  values: TermValues;
  onChange: (values: TermValues) => void;
}

function Field({
  field,
  value,
  onChange,
}: {
  field: DocumentField;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `field-${field.name}`;
  const hint = `hint-${field.name}`;

  const shared = {
    id,
    value,
    "aria-describedby": hint,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  };

  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{field.term}</span>
      <span className="field-hint" id={hint}>
        {field.description}
      </span>

      {field.type === "date" ? (
        <input type="date" {...shared} />
      ) : field.type === "enum" ? (
        <select {...shared}>
          <option value="">Select a state…</option>
          {(field.enum ?? US_STATES).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <textarea rows={2} {...shared} />
      )}
    </label>
  );
}

export default function TermsForm({ document, values, onChange }: Props) {
  return (
    <form className="form" onSubmit={(event) => event.preventDefault()}>
      <fieldset>
        <legend>{document.name}</legend>
        <span className="field-hint">{document.summary}</span>

        {document.fields.map((field) => (
          <Field
            key={field.name}
            field={field}
            value={values[field.name] ?? ""}
            onChange={(value) => onChange({ ...values, [field.name]: value })}
          />
        ))}
      </fieldset>
    </form>
  );
}
