/* Hallmark · component: select preview · genre: modern-minimal · theme: DESIGN.md
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (46–50)
 */

import { SelectControl } from "./SelectControl";

const OPTIONS = (
  <>
    <option value="india-visa">India · Visa · 51 × 51 mm</option>
    <option value="us-passport">United States · Passport · 51 × 51 mm</option>
  </>
);

interface PreviewRowProps {
  className?: string;
  disabled?: boolean;
  label: string;
  state?: "default" | "loading" | "error" | "success";
}

function PreviewRow({ className, disabled = false, label, state = "default" }: PreviewRowProps) {
  return (
    <div className="grid min-w-0 gap-1 sm:grid-cols-[6rem_minmax(0,1fr)] sm:items-center sm:gap-3">
      <span className="t-section-label">{label}</span>
      <SelectControl
        aria-label={`${label} select preview`}
        className={className}
        defaultValue="india-visa"
        disabled={disabled}
        displayValue="India · Visa"
        detail="51 × 51 mm · Selected item remains fully readable"
        state={state}
      >
        {OPTIONS}
      </SelectControl>
    </div>
  );
}

/** Standalone visual fixture for reviewing the shared select's complete state contract. */
export function SelectControlPreview() {
  return (
    <section
      aria-label="Select control eight-state preview"
      className="mx-auto grid w-full max-w-xl gap-3 bg-surface p-4 text-text"
    >
      <PreviewRow label="Default" />
      <PreviewRow label="Hover" className="is-hover" />
      <PreviewRow label="Focus" className="is-focus" />
      <PreviewRow label="Active" className="is-active" />
      <PreviewRow label="Disabled" disabled />
      <PreviewRow label="Loading" state="loading" />
      <PreviewRow label="Error" state="error" />
      <PreviewRow label="Success" state="success" />
    </section>
  );
}
