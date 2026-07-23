import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Printer } from "lucide-react";
import { useRoundActa } from "../hooks/useReparto";

type Variant = "citacion" | "final";

interface Props {
  roundId: string;
  variant: Variant;
}

/** ISO (YYYY-MM-DD) → dd/mm/yyyy for print; passthrough for anything else. */
function fmt(d: string | null): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

const TITLE: Record<Variant, string> = {
  citacion: "Acta de Citación (antes)",
  final: "Acta de Firmas — Final (después)",
};

/**
 * Round-scoped printable acta — the COMPLETE list of every family in the round,
 * ordered by numeric familia_numero. ADMIN-only (includes DNI/NIE for the legal
 * acta). Column layout differs per variant:
 *   · citación: fecha 1 (auto) + fecha 2 sit right after Teléfono (planning info).
 *   · final:    fecha de recogida + firma at the end, centred (pickup evidence).
 */
export function RepartoActaPrint({ roundId, variant }: Props) {
  const { data, isLoading } = useRoundActa(roundId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Generando acta…</p>;
  if (!data) return null;

  type ActaRow = (typeof data.rows)[number];
  interface Col { header: string; cell: (r: ActaRow) => ReactNode; center?: boolean; minW?: number }

  const identity: Col[] = [
    { header: "Nº Fam.", cell: (r) => r.familia_numero ?? r.expediente ?? "" },
    { header: "Nombre", cell: (r) => r.nombre ?? "" },
    { header: "Apellidos", cell: (r) => r.apellidos ?? "" },
    { header: "DNI/NIE", cell: (r) => r.dni ?? "" },
    { header: "Teléfono", cell: (r) => r.telefono ?? "" },
  ];
  const size: Col[] = [
    { header: "Ad.", cell: (r) => r.num_adultos ?? "", center: true },
    { header: "Men.", cell: (r) => r.num_menores ?? "", center: true },
    { header: "Total", cell: (r) => r.total_miembros, center: true },
    { header: "kg FyH", cell: (r) => r.kg_alimentos ?? "", center: true },
    { header: "kg Carne", cell: (r) => r.kg_carne ?? "", center: true },
  ];
  const firmaCell = (r: ActaRow): ReactNode =>
    variant === "final" && r.firma_url ? (
      <img src={r.firma_url} alt="Firma" className="firma mx-auto h-9 max-w-[150px] object-contain" />
    ) : null;

  const cols: Col[] =
    variant === "citacion"
      ? [
          ...identity,
          { header: "Fecha 1 - Automática", cell: (r) => fmt(r.fecha1), minW: 96 },
          { header: "Fecha 2", cell: (r) => fmt(r.fecha2), minW: 80 },
          ...size,
          { header: "Firma", cell: firmaCell, minW: 130 },
        ]
      : [
          ...identity,
          ...size,
          {
            header: "Fecha de recogida",
            cell: (r) => (r.fecha_real ? fmt(r.fecha_real) : r.attended === false ? "No asistió" : "—"),
            center: true,
            minW: 96,
          },
          { header: "Firma", cell: firmaCell, center: true, minW: 130 },
        ];

  return (
    <div className="space-y-3">
      {/* Print isolation: only #reparto-acta prints. Wide legal table → A4
          landscape; header repeats per page; rows never split; signatures print. */}
      <style>{`@media print {
        @page { size: A4 landscape; margin: 8mm; }
        body * { visibility: hidden !important; }
        #reparto-acta, #reparto-acta * { visibility: visible !important; }
        #reparto-acta { position: absolute; left: 0; top: 0; width: 100%; }
        #reparto-acta .acta-scroll { overflow: visible !important; }
        #reparto-acta img.firma { max-height: 38px; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
      }`}</style>
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">
          {data.header.num_familias} familias · orden numérico
          {variant === "citacion" && ` · ${data.header.num_contactadas} contactadas`}
        </p>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" aria-hidden /> Imprimir
        </Button>
      </div>

      {/* Soft gate: the acta is always printable, but warn if contacts are unfinished. */}
      {variant === "citacion" && data.header.num_contactadas < data.header.num_familias && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700 print:hidden" role="alert">
          Aún faltan {data.header.num_familias - data.header.num_contactadas} familias por contactar.
          Puedes imprimir igual, pero la fecha 2 solo aparece en las ya contactadas.
        </p>
      )}

      <div id="reparto-acta" className="rounded-lg border p-4 text-[11px]">
        <header className="mb-3 flex items-start justify-between gap-4">
          <div className="flex gap-2">
            {(data.header.logos ?? []).slice(0, 4).map((src, i) => (
              <img key={i} src={src} alt="" className="h-10 w-auto object-contain" />
            ))}
          </div>
          <div className="text-right">
            <h2 className="text-sm font-bold">{data.header.nombre ?? "Reparto"}</h2>
            <p className="font-semibold">{TITLE[variant]}</p>
            <p>Nº Albarán B.A.: {(data.header.num_albaran_ba ?? []).join(" · ") || "—"}</p>
            <p>Familias: {data.header.num_familias}</p>
          </div>
        </header>

        {/* Contained horizontal scroll on screen — never clips the page. */}
        <div className="acta-scroll overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse [font-variant-numeric:tabular-nums]">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th
                    key={c.header}
                    scope="col"
                    className={cn("border border-gray-400 px-1 py-0.5 font-semibold", c.center ? "text-center" : "text-left")}
                    style={c.minW ? { minWidth: c.minW } : undefined}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={`${r.familia_numero ?? r.expediente}-${i}`}>
                  {cols.map((c) => (
                    <td
                      key={c.header}
                      className={cn("border border-gray-400 px-1 py-1 align-middle", c.center && "text-center")}
                      style={c.minW ? { minWidth: c.minW } : undefined}
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
