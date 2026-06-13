/**
 * InterventionsList — purely presentational list of interventions inside a hoja.
 *
 * Renders the count badge, each intervention card (date / tipo / institucion,
 * descripcion, observaciones, signed/pending badge, and per-item exclude button),
 * and the empty-state row. The parent (HojaDrawer) owns the exclude confirmation
 * dialog and the excludeIntervencionId state; this component only calls onExclude.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export interface InterventionItem {
  id: string;
  fecha: string;
  tipo_slug: string;
  descripcion: string;
  observaciones?: string | null;
  firmado_url?: string | null;
  institucion_snapshot?: { nombre?: string } | null;
}

export interface InterventionsListProps {
  intervenciones: InterventionItem[];
  onExclude: (intervencionId: string) => void;
}

export function InterventionsList({
  intervenciones,
  onExclude,
}: InterventionsListProps) {
  return (
    <section className="mb-6" aria-label="Intervenciones">
      <div className="text-sm font-semibold mb-3 flex items-center gap-2">
        Intervenciones
        <Badge variant="secondary">{intervenciones.length}</Badge>
      </div>
      <ul className="space-y-2" aria-label="Lista de intervenciones">
        {intervenciones.map((iv) => (
          <li
            key={iv.id}
            className="border rounded-lg px-4 py-3 text-sm bg-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-xs text-muted-foreground mb-1">
                  {new Date(iv.fecha).toLocaleDateString("es-ES")}{" "}
                  · <span className="uppercase tracking-wide">{iv.tipo_slug}</span>
                  {iv.institucion_snapshot?.nombre
                    ? ` · ${iv.institucion_snapshot.nombre}`
                    : ""}
                </div>
                <div className="text-sm leading-snug">{iv.descripcion}</div>
                {iv.observaciones && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {iv.observaciones}
                  </div>
                )}
                <div className="mt-1.5">
                  <Badge
                    variant={iv.firmado_url ? "outline" : "secondary"}
                    className={
                      iv.firmado_url
                        ? "text-green-700 border-green-300 bg-green-50 text-xs"
                        : "text-xs"
                    }
                  >
                    {iv.firmado_url ? "Firmada" : "Pendiente de firma"}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                title="Excluir intervención"
                aria-label="Excluir intervención"
                onClick={() => onExclude(iv.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
        {intervenciones.length === 0 && (
          <li className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
            Sin intervenciones todavía
          </li>
        )}
      </ul>
    </section>
  );
}
