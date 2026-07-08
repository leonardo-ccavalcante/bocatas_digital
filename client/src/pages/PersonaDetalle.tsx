import { useState } from "react";
import { Link, useParams } from "wouter";
import { Loader2, AlertCircle, Users, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckinHistoryTable } from "@/features/persons/components/CheckinHistoryTable";
import { ConsentModal } from "@/features/persons/components/ConsentModal";
import {
  PersonaHeader,
  ResumenTab,
  DocumentosTab,
  NotasTab,
  DetailEmptyState,
} from "@/features/persons/components/detail";
import { useConsentTemplates } from "@/features/persons/hooks/useConsentTemplates";
import { usePersonById } from "@/features/persons/hooks/usePersonById";
import { EnrollmentPanel } from "@/features/programs/components/EnrollmentPanel";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

export default function PersonaDetalle() {
  const { id } = useParams<{ id: string }>();
  const { data: person, isLoading, isError, refetch } = usePersonById(id ?? "");
  const { user } = useAuth();
  const [showConsent, setShowConsent] = useState(false);
  const [activeTab, setActiveTab] = useState("resumen");

  // Only admins and superadmins see check-in data + the Familia CTA + the
  // high-risk fields gated inside the tabs.
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  // Real check-in total for the KPI strip — admin-only (preserves the gating
  // that already restricts all check-in data to admins). No fabricated count.
  const checkinCount = trpc.persons.getCheckinHistory.useQuery(
    { personId: id ?? "", limit: 1, offset: 0 },
    { enabled: !!id && isAdmin, staleTime: 60_000 },
  );
  const visitas = isAdmin ? checkinCount.data?.total : undefined;

  // Consent templates for the modal (triggered from the always-visible header button).
  // Lazy load, but also fetch when the modal is opened from any tab — otherwise the
  // modal shows "No hay plantillas…" off the resumen tab (Codex review on #118).
  const { data: templates = [] } = useConsentTemplates(
    (person?.idioma_principal as "es" | "ar" | "fr" | "bm") ?? "es",
    { enabled: activeTab === "resumen" || showConsent },
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !person) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-body-sm">No se pudo cargar la ficha de esta persona.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const personRow = person as PersonRow;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PersonaHeader
        person={personRow}
        visitas={visitas}
        onConsent={() => setShowConsent(true)}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col">
        {/* Underline tab strip — flush with the header's border-b.
            -mt-px pulls the strip up so active border-b-2 overlaps the
            header border, creating a seamless connected underline. */}
        <div className="sticky top-0 z-[9] -mt-px border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 sm:px-8">
            <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0 overflow-x-auto">
              {(
                [
                  { value: "resumen", label: "Resumen" },
                  { value: "programas", label: "Programas" },
                  { value: "documentos", label: "Documentos" },
                  { value: "asistencias", label: "Asistencias" },
                  { value: "notas", label: "Notas" },
                ] as const
              ).map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="
                    shrink-0 rounded-none border-b-2 border-transparent bg-transparent
                    px-3 py-2.5 text-[13px] font-medium text-muted-foreground shadow-none
                    transition-colors hover:text-foreground
                    data-[state=active]:border-primary data-[state=active]:text-foreground
                    data-[state=active]:bg-transparent data-[state=active]:shadow-none
                  "
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
          {/* Resumen — restyled summary of real person fields */}
          <TabsContent value="resumen" className="mt-0">
            <ResumenTab person={personRow} isAdmin={isAdmin} />
          </TabsContent>

          {/* Programas — existing EnrollmentPanel, same props as before */}
          <TabsContent value="programas" className="mt-0">
            {id && <EnrollmentPanel personId={id} isAdmin={isAdmin} />}

            {isAdmin && id && (
              <div className="bocatas-card mt-5 px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-h3 flex items-center gap-2 text-foreground">
                      <Users className="h-4 w-4" aria-hidden="true" /> Programa de
                      Familias
                    </h2>
                    <p className="mt-1 text-body-sm text-muted-foreground">
                      Registra a esta persona como titular de una unidad familiar
                    </p>
                  </div>
                  <Link href={`/familias/nueva?titular_id=${id}`}>
                    <Button variant="outline" size="sm">
                      Registrar familia
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Documentos — no endpoint yet: honest empty state (see component) */}
          <TabsContent value="documentos" className="mt-0">
            {activeTab === "documentos" && <DocumentosTab person={personRow} isAdmin={isAdmin} />}
          </TabsContent>

          {/* Asistencias — admin only, existing CheckinHistoryTable */}
          <TabsContent value="asistencias" className="mt-0">
            {isAdmin && id ? (
              <div className="bocatas-card px-5 py-4">
                <h2 className="text-h3 mb-4 text-foreground">
                  Historial de asistencia
                </h2>
                <CheckinHistoryTable personId={id} />
              </div>
            ) : (
              <DetailEmptyState
                icon={Lock}
                title="Acceso restringido"
                description="El historial de asistencia solo está disponible para el equipo responsable."
              />
            )}
          </TabsContent>

          {/* Notas — real observaciones + admin-only notas_privadas (no thread) */}
          <TabsContent value="notas" className="mt-0">
            {activeTab === "notas" && <NotasTab person={personRow} isAdmin={isAdmin} />}
          </TabsContent>
        </main>
      </Tabs>

      <ConsentModal
        open={showConsent}
        personId={personRow.id}
        templates={templates}
        onClose={() => setShowConsent(false)}
        onSaved={() => {
          setShowConsent(false);
          void refetch();
        }}
      />
    </div>
  );
}
