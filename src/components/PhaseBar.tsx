"use client";

import { PHASES, type Phase } from "@/lib/types";

export default function PhaseBar({ phase }: { phase: Phase }) {
  const index = PHASES.indexOf(phase as (typeof PHASES)[number]);
  const finished = phase === "完了";

  return (
    <div className="phaseBar">
      {PHASES.map((step, i) => {
        const state =
          finished || (index >= 0 && i < index)
            ? "done"
            : index === i
              ? "now"
              : "todo";
        return (
          <span className={`phaseStep is-${state}`} key={step}>
            <i className="phaseDot" />
            {step}
          </span>
        );
      })}
    </div>
  );
}
