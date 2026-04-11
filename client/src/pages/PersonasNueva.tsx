import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { RegistrationWizard } from "@/features/persons/components/RegistrationWizard";

export default function PersonasNueva() {
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/personas">
            <Button variant="ghost" size="sm" aria-label="Volver a personas">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-sm font-semibold">Nueva persona</h1>
        </div>
      </div>
      <RegistrationWizard />
    </div>
  );
}
