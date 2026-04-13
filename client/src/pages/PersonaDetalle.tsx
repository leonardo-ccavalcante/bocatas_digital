import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, AlertCircle } from "lucide-react";
import { PersonCard } from "@/features/persons/components/PersonCard";
import { CheckinHistoryTable } from "@/features/persons/components/CheckinHistoryTable";
import { EnrollmentPanel } from "@/features/programs/components/EnrollmentPanel";
import { usePersonById } from "@/features/persons/hooks/usePersonById";
import { useAuth } from "@/_core/hooks/useAuth";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

export default function PersonaDetalle() {
  const { id } = useParams<{ id: string }>();
  const { data: person, isLoading, isError, refetch } = usePersonById(id ?? "");
  const { user } = useAuth();

  // Only admins and superadmins see the check-in history section
  const isAdmin = user?.role === "admin";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/personas">
            <Button variant="ghost" size="sm" aria-label="Volver a personas">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-sm font-semibold">Ficha de persona</h1>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">No se pudo cargar la ficha de esta persona.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {/* Person profile */}
      {person && (
        <PersonCard
          person={person as PersonRow}
          onRefresh={() => void refetch()}
        />
      )}

      {/* Program enrollments — visible to all authenticated users */}
      {person && id && (
        <div className="max-w-2xl mx-auto px-4 pb-4">
          <div className="border-t border-border pt-6">
            <EnrollmentPanel personId={id} isAdmin={isAdmin} />
          </div>
        </div>
      )}

      {/* Check-in history — admin only */}
      {person && isAdmin && id && (
        <div className="max-w-2xl mx-auto px-4 pb-8">
          <div className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">
              Historial de asistencia
            </h2>
            <CheckinHistoryTable personId={id} />
          </div>
        </div>
      )}
    </div>
  );
}
