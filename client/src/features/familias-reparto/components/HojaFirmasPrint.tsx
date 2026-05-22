import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { useSigningRoster } from "../hooks/useReparto";

interface Props {
  roundId: string;
  day: string;
}

const COLS = [
  "Nº Exp.", "Nombre", "Apellidos", "DNI/NIE", "Teléfono",
  "Adultos", "Menores", "Total", "kg FyH", "kg Carne", "Firma",
];

/**
 * Acta de entrega / Hoja de Firmas — printable A4 table modeled on the paper
 * sheet (Images/notas_entrega.jpeg). Admin-only data (includes DNI). Uses the
 * browser print dialog + print CSS — no heavy PDF dependency.
 */
export function HojaFirmasPrint({ roundId, day }: Props) {
  const { data, isLoading } = useSigningRoster(roundId, day);

  if (isLoading) return <p className="text-sm text-muted-foreground">Generando hoja de firmas…</p>;
  if (!data) return null;

  return (
    <div className="space-y-3">
      {/* Print isolation: only #hoja-firmas prints (the app has no global print CSS). */}
      <style>{`@media print { body * { visibility: hidden !important; } #hoja-firmas, #hoja-firmas * { visibility: visible !important; } #hoja-firmas { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">{data.rows.length} familias · {day}</p>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" aria-hidden /> Imprimir
        </Button>
      </div>

      <div id="hoja-firmas" className="rounded-lg border p-4 text-[11px]">
        <header className="mb-3 flex items-start justify-between gap-4">
          <div className="flex gap-2">
            {(data.header.logos ?? []).slice(0, 4).map((src, i) => (
              <img key={i} src={src} alt="" className="h-10 w-auto object-contain" />
            ))}
          </div>
          <div className="text-right">
            <h2 className="text-sm font-bold">{data.header.nombre ?? "Hoja de Firmas"}</h2>
            <p>Nº Albarán B.A.: {data.header.num_albaran_ba ?? "—"}</p>
            <p>Familias: {data.header.num_familias} · Fecha: {data.header.fecha}</p>
          </div>
        </header>

        <table className="w-full border-collapse">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c} className="border border-gray-400 px-1 py-0.5 text-left font-semibold">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={`${r.expediente}-${i}`}>
                <td className="border border-gray-400 px-1 py-1">{r.expediente ?? ""}</td>
                <td className="border border-gray-400 px-1 py-1">{r.nombre ?? ""}</td>
                <td className="border border-gray-400 px-1 py-1">{r.apellidos ?? ""}</td>
                <td className="border border-gray-400 px-1 py-1">{r.dni ?? ""}</td>
                <td className="border border-gray-400 px-1 py-1">{r.telefono ?? ""}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{r.num_adultos ?? ""}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{r.num_menores ?? ""}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{r.total_miembros}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{r.kg_alimentos ?? ""}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{r.kg_carne ?? ""}</td>
                <td className="border border-gray-400 px-1 py-1" style={{ minWidth: 120 }} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
