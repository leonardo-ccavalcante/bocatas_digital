import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { useListadoInterno } from "../hooks/useReparto";

interface Props {
  roundId: string;
  day: string;
}

/** Listado interno (admin) — nº familia, titular, nº miembros, teléfono, fecha
 * cita. No DNI. Printable via the browser print dialog. */
export function ListadoInternoPrint({ roundId, day }: Props) {
  const { data, isLoading } = useListadoInterno(roundId, day);

  if (isLoading) return <p className="text-sm text-muted-foreground">Generando listado interno…</p>;
  if (!data) return null;

  return (
    <div className="space-y-3">
      {/* Print isolation: only #listado-interno prints. */}
      <style>{`@media print { body * { visibility: hidden !important; } #listado-interno, #listado-interno * { visibility: visible !important; } #listado-interno { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">{data.rows.length} familias · {day}</p>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" aria-hidden /> Imprimir
        </Button>
      </div>
      <div id="listado-interno" className="rounded-lg border p-4 text-xs">
        <h2 className="mb-2 text-sm font-bold">{data.nombre ?? "Listado interno"} — {data.fecha_cita}</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["Nº Exp.", "Titular", "Nº miembros", "Teléfono", "Fecha cita"].map((c) => (
                <th key={c} className="border border-gray-400 px-1 py-0.5 text-left font-semibold">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={`${r.expediente}-${i}`}>
                <td className="border border-gray-400 px-1 py-1">{r.expediente ?? ""}</td>
                <td className="border border-gray-400 px-1 py-1">{r.titular ?? ""}</td>
                <td className="border border-gray-400 px-1 py-1 text-center">{r.num_miembros}</td>
                <td className="border border-gray-400 px-1 py-1">{r.telefono ?? ""}</td>
                <td className="border border-gray-400 px-1 py-1">{data.fecha_cita}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
