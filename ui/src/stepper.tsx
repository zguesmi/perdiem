import type { Step, StepKey } from "./steps.ts";

/**
 * The five steps the auction walks, as buttons.
 *
 * A reached step can be clicked to read its detail again; an unreached one is disabled, because
 * there is nothing to read. Timeout is always on screen, dashed and muted, so the way out is
 * visible before it is taken.
 */
export function Stepper({
  steps,
  selected,
  onSelect,
}: {
  steps: Step[];
  selected?: StepKey;
  onSelect: (key: StepKey) => void;
}) {
  return (
    <ol className="stepper">
      {steps.map((step) => (
        <li key={step.key} className={rail(step)}>
          <button
            type="button"
            className={classes(step, step.key === selected)}
            data-reached={step.reached ? "yes" : "no"}
            disabled={!step.reached}
            onClick={() => onSelect(step.key)}
          >
            <span className="marker">{step.mark}</span>
            <span className="name">
              {step.name}
              {step.note && <span className="note">{step.note}</span>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** The leg to the left of a step is filled once the auction reached that step. */
function rail(step: Step): string {
  if (step.status === "refunded") {
    return "refunded";
  }
  return step.reached ? "filled" : "";
}

function classes(step: Step, selected: boolean): string {
  const status = step.status === "pending" ? "" : ` ${step.status}`;
  return `step${status}${selected ? " selected" : ""}`;
}
