/**
 * EntregasTab — "Entregas" tab content for the familia ficha.
 *
 * Visuals ported from the v4 prototype (familias.jsx · EntregasSection): a
 * delivery-history table with an upload action. ALL rows come from the real
 * entregas.getDeliveries query — no fabricated deliveries, kg or signatures.
 */
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";

interface Delivery {
  id: string;
  fecha_entrega: string;
  recogido_por: string | null;
  es_autorizado: boolean | null;
  kg_frutas_hortalizas: number | null;
  kg_carne: number | null;
}

interface EntregasTabProps {
  deliveries: Delivery[] | undefined;
  onUploadDelivery: () => void;
  onDeliveryDoc: (deliveryId: string) => void;
}

export function EntregasTab({
  deliveries,
  onUploadDelivery,
  onDeliveryDoc,
}: EntregasTabProps) {
  const rows = deliveries ?? [];

  return (
    <div className="bocatas-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-h3 text-foreground">Historial de entregas</h2>
        <Button size="sm" onClick={onUploadDelivery}>
          <Package className="mr-2 h-4 w-4" aria-hidden="true" />
          Subir documento de entregas
        </Button>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border text-left text-eyebrow text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Fecha</th>
                <th className="px-2 py-3 font-semibold">Recogido por</th>
                <th className="px-2 py-3 text-right font-semibold">F+H (kg)</th>
                <th className="px-2 py-3 text-right font-semibold">Carne (kg)</th>
                <th className="px-5 py-3 text-right font-semibold">Documento</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-border hover:bg-accent/40">
                  <td className="tabular-stat px-5 py-3 text-foreground">
                    {new Date(d.fecha_entrega).toLocaleDateString("es-ES")}
                  </td>
                  <td className="px-2 py-3 text-muted-foreground">
                    {d.recogido_por ?? "—"}
                    {d.es_autorizado ? (
                      <span className="ml-1 text-xs">(autorizado)</span>
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="tabular-stat px-2 py-3 text-right text-foreground">
                    {d.kg_frutas_hortalizas ?? "—"}
                  </td>
                  <td className="tabular-stat px-2 py-3 text-right text-foreground">
                    {d.kg_carne ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDeliveryDoc(d.id)}
                    >
                      Ver documento
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center text-muted-foreground">
          <Package className="mx-auto mb-3 h-12 w-12 opacity-30" aria-hidden="true" />
          <p className="text-body-sm">Sin entregas registradas</p>
        </div>
      )}
    </div>
  );
}
