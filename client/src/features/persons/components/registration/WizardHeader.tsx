import { Link } from "wouter";
import { WizardStepper, type StepperPhase } from "./WizardStepper";

interface WizardHeaderProps {
  phases: readonly StepperPhase[];
  /** 1-based current phase. */
  current: number;
}

/**
 * WizardHeader — editorial registration header ported from the v4 prototype:
 * breadcrumb (Personas / Nueva), eyebrow, display title, and the phase stepper.
 */
export function WizardHeader({ phases, current }: WizardHeaderProps) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-5 sm:px-8">
        <nav aria-label="Migas" className="mb-3 flex items-center gap-2 text-body-sm">
          <Link
            href="/personas"
            className="text-muted-foreground transition-colors hover:text-primary"
          >
            Personas
          </Link>
          <span aria-hidden="true" className="text-muted-foreground">
            /
          </span>
          <span className="font-medium text-foreground">Nueva</span>
        </nav>
        <p className="text-eyebrow text-muted-foreground">Alta · 4 pasos</p>
        <h1 className="mt-1 text-display-2 text-foreground">Registrar persona</h1>
        <WizardStepper phases={phases} current={current} />
      </div>
    </header>
  );
}
