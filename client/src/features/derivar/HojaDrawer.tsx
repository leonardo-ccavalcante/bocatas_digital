/**
 * HojaDrawer — Sheet panel displaying a full hoja with all its interventions.
 *
 * SIS-01 parent rewrite: preview, template-management, and signed-upload
 * modal blocks extracted to self-contained child components. The parent
 * retains only the open-state booleans and delegates all modal logic.
 */

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  FileText,
  FileDown,
  Upload,
  Settings,
  ExternalLink,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { TemplateManagementModal } from "./components/TemplateManagementModal";
import { SignedHojaUploadModal } from "./components/SignedHojaUploadModal";
import { DocPreviewModal } from "./components/DocPreviewModal";
import { InterventionsList } from "./components/InterventionsList";
import { ExcludeInterventionModal } from "./components/ExcludeInterventionModal";

interface HojaDrawerProps {
  hojaId: string | null;
  onClose: () => void;
  onAddIntervention: (hojaId: string) => void;
}

interface RawPersona {
  nombre?: string;
  apellidos?: string;
}

interface RawFamilia {
  familia_numero?: number | null;
  titular?: RawPersona | null;
}

interface RawPrograma {
  name?: string;
}

interface RawHoja {
  id: string;
  scope: string;
  fecha_apertura: string;
  profesional_nombre: string;
  firmado_url?: string | null;
  persona?: RawPersona | null;
  familia?: RawFamilia | null;
  programa?: RawPrograma | null;
}

interface RawIntervencion {
  id: string;
  fecha: string;
  tipo_slug: string;
  descripcion: string;
  observaciones?: string | null;
  firmado_url?: string | null;
  excluded_at?: string | null;
  institucion_snapshot?: { nombre?: string } | null;
}

export function HojaDrawer({
  hojaId,
  onClose,
  onAddIntervention,
}: HojaDrawerProps) {
  const enabled = !!hojaId;
  const result = trpc.derivar.getHoja.useQuery(
    { hojaId: hojaId ?? "" },
    { enabled },
  );
  // Preview modal state — open discriminator only; DocPreviewModal owns the rest
  const [previewKind, setPreviewKind] = useState<"docx" | "pdf" | null>(null);

  // Template management modal state
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  // Exclude intervention modal state — coordinator; ExcludeInterventionModal owns the rest
  const [excludeIntervencionId, setExcludeIntervencionId] = useState<string | null>(null);

  // Upload signed hoja modal state — open trigger only; SignedHojaUploadModal owns the rest
  const [signedModalOpen, setSignedModalOpen] = useState(false);

  if (!hojaId) return null;

  const rawData = result.data as
    | { hoja: RawHoja; intervenciones: RawIntervencion[] }
    | undefined;

  const hoja = rawData?.hoja;
  const intervenciones = rawData?.intervenciones ?? [];

  const isPersona = hoja?.scope === "persona";
  const titular = hoja?.familia?.titular;
  const nombre = isPersona
    ? `${hoja?.persona?.nombre ?? ""} ${hoja?.persona?.apellidos ?? ""}`.trim()
    : titular
      ? `${titular.nombre ?? ""} ${titular.apellidos ?? ""}`.trim()
      : `Familia #${hoja?.familia?.familia_numero ?? ""}`;

  return (
    <>
      <Sheet open={enabled} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto px-6 py-6"
          aria-label="Hoja de derivaciones"
        >
          <SheetHeader className="mb-6">
            <SheetTitle className="text-xl font-semibold">
              {result.isLoading ? (
                <Skeleton className="h-6 w-64" />
              ) : (
                "Hoja de derivaciones"
              )}
            </SheetTitle>
          </SheetHeader>

          {result.isLoading ? (
            <div className="space-y-3 mt-2" aria-busy="true">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : hoja ? (
            <>
              {/* Header info */}
              <section
                className="bg-muted/40 rounded-lg px-4 py-3 space-y-1.5 text-sm mb-6"
                aria-label="Datos del expediente"
              >
                <div className="font-semibold text-base mb-1">{nombre}</div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">Programa:</span>{" "}
                    {hoja.programa?.name}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Profesional:</span>{" "}
                    {hoja.profesional_nombre}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Apertura:</span>{" "}
                    {new Date(hoja.fecha_apertura).toLocaleDateString("es-ES")}
                  </span>
                </div>
                {hoja.firmado_url && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                      Firmada
                    </Badge>
                    <a
                      href={hoja.firmado_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary flex items-center gap-1 hover:underline"
                    >
                      Ver hoja firmada <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </section>

              {/* Interventions list */}
              <InterventionsList intervenciones={intervenciones} onExclude={setExcludeIntervencionId} />

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button
                  type="button"
                  onClick={() => onAddIntervention(hojaId)}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Añadir intervención
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setPreviewKind("docx")}
                  className="gap-1"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Generar Word
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setPreviewKind("pdf")}
                  className="gap-1"
                >
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                  Generar PDF
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setSignedModalOpen(true)}
                  className="gap-1"
                  title="Subir hoja firmada en PDF"
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Subir hoja firmada
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setTemplateModalOpen(true)}
                  title="Gestionar plantilla DOCX"
                  aria-label="Cambiar plantilla"
                  className="gap-1"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Cambiar plantilla
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-6 text-muted-foreground text-center py-8">
              Hoja no encontrada.
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Preview modal ─────────────────────────────────────────────────────── */}
      <DocPreviewModal
        previewKind={previewKind}
        hojaId={hojaId}
        onClose={() => setPreviewKind(null)}
      />

      {/* ── Template management modal ─────────────────────────────────────────── */}
      <TemplateManagementModal
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
      />

      {/* ── Upload signed hoja modal ──────────────────────────────────────────── */}
      <SignedHojaUploadModal
        open={signedModalOpen}
        onOpenChange={setSignedModalOpen}
        hojaId={hojaId}
      />

      {/* ── Exclude intervention confirmation modal ───────────────────────────── */}
      <ExcludeInterventionModal
        intervencionId={excludeIntervencionId}
        hojaId={hojaId}
        onClose={() => setExcludeIntervencionId(null)}
      />
    </>
  );
}
