import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperPhase {
  /** 1-based phase index. */
  n: number;
  label: string;
}

interface WizardStepperProps {
  phases: readonly StepperPhase[];
  /** 1-based current phase. */
  current: number;
}

/**
 * WizardStepper — editorial 4-phase stepper header ported from the v4
 * prototype (persona-nueva.jsx). Token-based colours only.
 *
 * States per node:
 *   done    → filled primary circle with check
 *   current → filled foreground circle with number
 *   upcoming→ outlined circle with number
 */
export function WizardStepper({ phases, current }: WizardStepperProps) {
  return (
    <ol className="mt-5 flex items-center gap-2 sm:gap-3" aria-label="Progreso del alta">
      {phases.map((phase, i) => {
        const done = phase.n < current;
        const isCurrent = phase.n === current;
        return (
          <li
            key={phase.n}
            aria-current={isCurrent ? "step" : undefined}
            className="flex flex-1 items-center gap-2 last:flex-none"
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold",
                  done && "bg-primary text-primary-foreground",
                  isCurrent && "bg-foreground text-background",
                  !done && !isCurrent && "border border-border bg-card text-muted-foreground"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : phase.n}
              </span>
              <span
                className={cn(
                  "text-body-sm",
                  isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {phase.label}
              </span>
            </span>
            {i < phases.length - 1 && (
              <span aria-hidden="true" className="h-px max-w-12 flex-1 bg-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
