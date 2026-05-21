/**
 * HojaDrawer — Sheet panel displaying a full hoja with all its interventions.
 *
 * Features:
 * - Lists all interventions for the entity in this programa.
 * - "Generar Word" / "Generar PDF" trigger server-side generation and download.
 * - "Añadir intervención" delegates back to the parent via onAddIntervention.
 * - "Subir hoja firmada" is stubbed (disabled) pending v2 per-row signatures.
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
import { Plus, FileText, FileDown, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface HojaDrawerProps {
  hojaId: string | null;
  onClose: () => void;
  onAddIntervention: (hojaId: string) => void;
}

function downloadBase64(b64: string, filename: string, mime: string): void {
  const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], {
    type: mime,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  const trpcCtx = trpc.useUtils();
  const [busy, setBusy] = useState<"docx" | "pdf" | null>(null);

  if (!hojaId) return null;

  const onGenerate = async (kind: "docx" | "pdf") => {
    setBusy(kind);
    try {
      const out =
        kind === "docx"
          ? await trpcCtx.derivar.generateDocx.fetch({ hojaId })
          : await trpcCtx.derivar.generatePdf.fetch({ hojaId });
      downloadBase64(out.contentBase64, out.filename, out.mime);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error al generar el documento",
      );
    } finally {
      setBusy(null);
    }
  };

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
    <Sheet open={enabled} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
        aria-label="Hoja de derivaciones"
      >
        <SheetHeader>
          <SheetTitle>
            {result.isLoading ? (
              <Skeleton className="h-6 w-64" />
            ) : (
              `Hoja de derivaciones — ${nombre}`
            )}
          </SheetTitle>
        </SheetHeader>

        {result.isLoading ? (
          <div className="space-y-2 mt-6" aria-busy="true">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : hoja ? (
          <>
            <section className="mt-4 text-sm space-y-1" aria-label="Datos del expediente">
              <div>
                <span className="text-muted-foreground">Programa: </span>
                {hoja.programa?.name}
              </div>
              <div>
                <span className="text-muted-foreground">Profesional: </span>
                {hoja.profesional_nombre}
              </div>
              <div>
                <span className="text-muted-foreground">Apertura: </span>
                {new Date(hoja.fecha_apertura).toLocaleDateString("es-ES")}
              </div>
            </section>

            <section className="mt-6" aria-label="Intervenciones">
              <div className="text-sm font-medium mb-2">
                Intervenciones ({intervenciones.length})
              </div>
              <ul className="space-y-2" aria-label="Lista de intervenciones">
                {intervenciones.map((iv) => (
                  <li key={iv.id} className="border rounded p-2 text-sm">
                    <div className="font-medium">
                      {new Date(iv.fecha).toLocaleDateString("es-ES")}{" "}
                      · {iv.tipo_slug}
                      {iv.institucion_snapshot?.nombre
                        ? ` · ${iv.institucion_snapshot.nombre}`
                        : ""}
                    </div>
                    <div className="mt-1">{iv.descripcion}</div>
                    {iv.observaciones && (
                      <div className="mt-1 text-muted-foreground">
                        {iv.observaciones}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {iv.firmado_url ? "Firmada" : "Pendiente de firma"}
                    </div>
                  </li>
                ))}
                {intervenciones.length === 0 && (
                  <li className="text-sm text-muted-foreground">
                    Sin intervenciones todavía
                  </li>
                )}
              </ul>
            </section>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => onAddIntervention(hojaId)}
              >
                <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                Añadir intervención
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => onGenerate("docx")}
                disabled={busy !== null}
                aria-busy={busy === "docx"}
              >
                <FileText className="h-4 w-4 mr-1" aria-hidden="true" />
                {busy === "docx" ? "Generando..." : "Generar Word"}
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => onGenerate("pdf")}
                disabled={busy !== null}
                aria-busy={busy === "pdf"}
              >
                <FileDown className="h-4 w-4 mr-1" aria-hidden="true" />
                {busy === "pdf" ? "Generando..." : "Generar PDF"}
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled
                title="Subir hoja firmada — próximamente"
              >
                <Upload className="h-4 w-4 mr-1" aria-hidden="true" />
                Subir hoja firmada
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-6 text-muted-foreground">Hoja no encontrada.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
