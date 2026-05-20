import { RegistrationWizard } from "@/features/persons/components/RegistrationWizard";

/**
 * PersonasNueva — route shell for the person registration wizard.
 *
 * The editorial header (breadcrumb, eyebrow, display title and 4-step stepper)
 * lives inside RegistrationWizard, ported from the v4 prototype. This wrapper
 * stays thin and only mounts the wizard.
 */
export default function PersonasNueva() {
  return (
    <div className="min-h-screen bg-background">
      <RegistrationWizard />
    </div>
  );
}
