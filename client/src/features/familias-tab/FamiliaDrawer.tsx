import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { ExternalLink, AlertTriangle } from "lucide-react";

interface FamiliaDrawerProps {
  familyId: string | null;
  onClose: () => void;
}

// Widen the inferred tRPC return type to the fields we actually use.
// The cast lives here and nowhere else — components consume typed props.
interface FamiliaSummary {
  id: string;
  familia_numero: number | null;
  estado: string | null;
  num_adultos: number | null;
  num_menores_18: number | null;
  persona_recoge: string | null;
  alta_en_guf: boolean | null;
  fecha_alta_guf: string | null;
  padron_recibido: boolean | null;
  informe_social: boolean | null;
  informe_social_fecha: string | null;
  consent_bocatas: boolean | null;
  consent_banco_alimentos: boolean | null;
  docs_identidad: boolean | null;
  persons?: {
    id?: string | null;
    nombre?: string | null;
    apellidos?: string | null;
    telefono?: string | null;
    email?: string | null;
  } | null;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "default" : "destructive"} aria-label={`${label}: ${ok ? "cumplido" : "pendiente"}`}>
      {ok ? "✓" : "⚠"} {label}
    </Badge>
  );
}

export function FamiliaDrawer({ familyId, onClose }: FamiliaDrawerProps) {
  // Only fire the query when we have an ID. The `enabled` flag skips the
  // request entirely when the drawer is closed — uuidLike rejects "".
  const { data: rawFamily, isLoading } = trpc.families.getById.useQuery(
    { id: familyId ?? "" },
    { enabled: !!familyId },
  );

  const f = rawFamily as FamiliaSummary | undefined;
  const titular = f?.persons ?? null;
  const titularName =
    titular
      ? `${titular.nombre ?? ""} ${titular.apellidos ?? ""}`.trim()
      : "";
  const totalMiembros = (f?.num_adultos ?? 0) + (f?.num_menores_18 ?? 0);
  const hasRiesgo =
    !!f &&
    (!f.alta_en_guf ||
      !f.padron_recibido ||
      !f.informe_social ||
      !f.consent_bocatas ||
      !f.consent_banco_alimentos ||
      !f.docs_identidad);

  return (
    <Sheet open={!!familyId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>
            {isLoading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              <span className="flex items-center gap-2">
                Familia #{f?.familia_numero ?? "—"}
                {hasRiesgo && (
                  <AlertTriangle
                    className="h-4 w-4 text-amber-500"
                    aria-label="Atención requerida"
                  />
                )}
              </span>
            )}
          </SheetTitle>
          <SheetDescription>
            {isLoading ? (
              <Skeleton className="h-4 w-48" />
            ) : titularName ? (
              `Titular: ${titularName}`
            ) : (
              "Sin titular asignado"
            )}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-6 space-y-3 px-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : f ? (
          <div className="px-4">
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Estado: </span>
                <Badge variant={f.estado === "activa" ? "default" : "outline"}>
                  {f.estado === "activa" ? "Activa" : "En baja"}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Miembros: </span>
                {totalMiembros}
              </div>
              <div>
                <span className="text-muted-foreground">Recoge: </span>
                {f.persona_recoge ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Teléfono: </span>
                {titular?.telefono ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Informe social: </span>
                {f.informe_social_fecha
                  ? new Date(f.informe_social_fecha).toLocaleDateString("es-ES")
                  : "Pendiente"}
              </div>
              <div>
                <span className="text-muted-foreground">Alta GUF: </span>
                {f.fecha_alta_guf
                  ? new Date(f.fecha_alta_guf).toLocaleDateString("es-ES")
                  : f.alta_en_guf
                  ? "Sí"
                  : "No"}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Compliance
              </p>
              <div className="flex flex-wrap gap-2">
                <StatusBadge ok={!!f.padron_recibido} label="Padrón" />
                <StatusBadge ok={!!f.informe_social} label="Informe social" />
                <StatusBadge ok={!!f.alta_en_guf} label="GUF" />
                <StatusBadge ok={!!f.docs_identidad} label="Docs identidad" />
                <StatusBadge ok={!!f.consent_bocatas} label="Consent. Bocatas" />
                <StatusBadge ok={!!f.consent_banco_alimentos} label="Consent. BdA" />
              </div>
            </div>

            {/* TODO Phase 2: surface last delivery date from a join with `deliveries`. */}

            <div className="mt-6 space-y-2">
              <Link href={`/familias/${f.id}`}>
                <Button className="w-full" variant="default">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir página completa
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 px-4 text-center text-muted-foreground">
            Familia no encontrada.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
