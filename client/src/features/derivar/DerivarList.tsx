/**
 * DerivarList — paginated list of derivar interventions for a programa.
 *
 * Each row click opens the HojaDrawer via the onRowClick callback.
 * Keyboard-accessible: rows have role="button", tabIndex=0, and respond
 * to Enter and Space keys.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface DerivarListProps {
  programaId: string;
  onRowClick: (hojaId: string) => void;
}

interface RawHoja {
  id: string;
  scope: string;
  persona?: { nombre?: string; apellidos?: string } | null;
  familia?: {
    familia_numero?: number | null;
    persons?: { nombre?: string; apellidos?: string } | null;
  } | null;
}

interface RawRow {
  id: string;
  tipo_slug: string;
  fecha: string | null;
  institucion_snapshot?: { nombre?: string } | null;
  hoja?: RawHoja | null;
}

function resolvePersonaName(hoja: RawHoja): string {
  if (hoja.scope === "persona") {
    return `${hoja.persona?.nombre ?? ""} ${hoja.persona?.apellidos ?? ""}`.trim();
  }
  const titular = hoja.familia?.persons;
  if (titular) {
    return `${titular.nombre ?? ""} ${titular.apellidos ?? ""}`.trim();
  }
  return hoja.familia?.familia_numero
    ? `Familia #${hoja.familia.familia_numero}`
    : "—";
}

export function DerivarList({ programaId, onRowClick }: DerivarListProps) {
  const { data, isLoading } = trpc.derivar.list.useQuery({
    programaId,
    limit: 100,
  });

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Cargando derivaciones">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const rows = (data ?? []) as RawRow[];

  return (
    <Card>
      <CardContent className="p-0">
        <table
          className="w-full text-sm"
          aria-label="Lista de derivaciones e intervenciones"
        >
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="p-2 text-left font-medium">
                Persona / Familia
              </th>
              <th scope="col" className="p-2 text-left font-medium">
                Fam.
              </th>
              <th scope="col" className="p-2 text-left font-medium">
                Tipo
              </th>
              <th scope="col" className="p-2 text-left font-medium">
                Institución
              </th>
              <th scope="col" className="p-2 text-left font-medium">
                Fecha
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hoja = row.hoja;
              const personaName = hoja ? resolvePersonaName(hoja) : "—";
              const familiaNum = hoja?.familia?.familia_numero;
              const instNombre = row.institucion_snapshot?.nombre;
              const hojaId = hoja?.id;

              return (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={hojaId ? 0 : -1}
                  aria-label={`Abrir hoja de ${personaName}`}
                  className="border-t hover:bg-muted/40 cursor-pointer focus:outline-none focus:bg-muted/60"
                  onClick={() => hojaId && onRowClick(hojaId)}
                  onKeyDown={(e) => {
                    if (hojaId && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onRowClick(hojaId);
                    }
                  }}
                >
                  <td className="p-2">{personaName}</td>
                  <td className="p-2">
                    {familiaNum ? `#${familiaNum}` : "—"}
                  </td>
                  <td className="p-2">{row.tipo_slug}</td>
                  <td className="p-2">{instNombre ?? "—"}</td>
                  <td className="p-2">
                    {row.fecha
                      ? new Date(row.fecha).toLocaleDateString("es-ES")
                      : "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="p-6 text-center text-muted-foreground"
                >
                  Sin derivaciones
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
