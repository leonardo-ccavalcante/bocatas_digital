import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useRoundActa, useListSlots } from "../hooks/useReparto";
import { ContactoFamiliaDialog, type ContactoAssignment } from "./ContactoFamiliaDialog";

interface Props {
  roundId: string;
}

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  confirmada: { label: "Confirmada", className: "bg-green-100 text-green-800 border-green-200" },
  no_contesta: { label: "No contesta", className: "bg-amber-100 text-amber-800 border-amber-200" },
  reprogramada: { label: "Reprogramada", className: "bg-blue-100 text-blue-800 border-blue-200" },
  renuncia: { label: "Renuncia", className: "bg-red-100 text-red-800 border-red-200" },
};

function estadoBadge(estado: string | null) {
  const e = estado ?? "pendiente";
  return ESTADO_BADGE[e] ?? { label: "Pendiente", className: "bg-muted text-muted-foreground" };
}

/** Normalize a string for accent- and case-insensitive matching. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Contact phase (admin): work through the round's families, recording the days
 * each can come (fecha 1 / fecha 2) or an early renuncia. The suggested day is
 * automatic; this refines it before the acta de citación is printed.
 */
export function ContactoPanel({ roundId }: Props) {
  const { data, isLoading } = useRoundActa(roundId);
  const { data: slots } = useListSlots(roundId);
  const [selected, setSelected] = useState<ContactoAssignment | null>(null);
  const [search, setSearch] = useState("");

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando familias…</p>;
  if (!data) return null;

  const { num_familias, num_contactadas } = data.header;
  const pendientes = num_familias - num_contactadas;

  const filteredRows = search
    ? data.rows.filter((r) => {
        const nombre = [r.nombre, r.apellidos].filter(Boolean).join(" ").trim();
        const query = normalize(search);
        return (
          normalize(nombre).includes(query) ||
          normalize(String(r.familia_numero ?? "")).includes(query) ||
          normalize(String(r.expediente ?? "")).includes(query)
        );
      })
    : data.rows;

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/20 p-3" role="status">
        <p className="text-sm font-medium">
          {num_contactadas} de {num_familias} familias contactadas
        </p>
        {pendientes > 0 && (
          <p className="text-xs text-amber-600">
            Faltan {pendientes} por contactar. Puedes generar el acta de citación igual
            (pestaña «Documentos»), pero reflejará solo los contactos ya registrados.
          </p>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
        <Input
          placeholder="Buscar familia por nombre o número…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
          aria-label="Buscar familia en la lista de contacto"
        />
      </div>

      {search && filteredRows.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay resultados para «{search}»
        </p>
      )}

      {filteredRows.length > 0 && (
        <ul className="divide-y rounded-md border">
          {filteredRows.map((r) => {
            const badge = estadoBadge(r.estado_contacto);
            const nombre = [r.nombre, r.apellidos].filter(Boolean).join(" ").trim();
            return (
              <li key={r.assignment_id} className="flex items-center gap-2 p-2">
                <span className="w-14 shrink-0 text-xs font-mono text-muted-foreground">
                  Nº {r.familia_numero ?? r.expediente ?? "—"}
                </span>
                <span className="flex-1 truncate text-sm">{nombre || "Sin titular"}</span>
                <Badge variant="outline" className={`text-xs ${badge.className}`}>{badge.label}</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11 text-xs"
                  onClick={() =>
                    setSelected({
                      assignment_id: r.assignment_id,
                      familia_numero: r.familia_numero,
                      nombre: nombre || null,
                      estado_contacto: r.estado_contacto,
                      preferred_slot_ids: r.preferred_slot_ids,
                    })
                  }
                >
                  Registrar contacto
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <ContactoFamiliaDialog
        assignment={selected}
        slots={slots ?? []}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
