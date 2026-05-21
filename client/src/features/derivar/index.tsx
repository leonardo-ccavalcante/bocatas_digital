/**
 * DerivarTab — main entry point for the /programas/:id?tab=derivar route.
 *
 * Composes DerivarList + HojaDrawer + NuevaIntervencionForm inside a Dialog.
 * The "Nueva intervención" flow is a two-step wizard:
 *   Step 1 — pick scope (persona | familia) and search for the entity.
 *   Step 2 — fill the intervention form (smart pre-fill from startIntervention).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { DerivarList } from "./DerivarList";
import { HojaDrawer } from "./HojaDrawer";
import { NuevaIntervencionForm } from "./NuevaIntervencionForm";
import type { Scope } from "@shared/derivar/types";

interface DerivarTabProps {
  programaId: string;
}

interface RawFamiliaRow {
  id: string;
  familia_numero?: number | null;
  persons?: { nombre?: string; apellidos?: string } | null;
}

export default function DerivarTab({ programaId }: DerivarTabProps) {
  const [drawerHojaId, setDrawerHojaId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("persona");
  const [search, setSearch] = useState("");
  const [entityId, setEntityId] = useState<string | null>(null);

  // persons.search uses `query` param (min 2 chars)
  const personSearch = trpc.persons.search.useQuery(
    { query: search },
    { enabled: scope === "persona" && search.length >= 2 },
  );

  // families.getAll supports search + estado params
  const familiaSearch = trpc.families.getAll.useQuery(
    { search, estado: "all" },
    { enabled: scope === "familia" && search.length >= 2 },
  );

  const resetNewDialog = () => {
    setEntityId(null);
    setSearch("");
    setScope("persona");
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          Nueva intervención
        </Button>
      </div>

      <DerivarList programaId={programaId} onRowClick={setDrawerHojaId} />

      <HojaDrawer
        hojaId={drawerHojaId}
        onClose={() => setDrawerHojaId(null)}
        onAddIntervention={(hId) => {
          // In v2 the form will resolve scope+entity from hojaId.
          // For now close drawer and open the wizard from scratch.
          setDrawerHojaId(null);
          void hId;
          setNewOpen(true);
        }}
      />

      {/* Nueva intervención dialog */}
      <Dialog
        open={newOpen}
        onOpenChange={(open) => {
          setNewOpen(open);
          if (!open) resetNewDialog();
        }}
      >
        <DialogContent
          className="max-w-2xl"
          aria-labelledby="nueva-intervencion-title"
        >
          <DialogHeader>
            <DialogTitle id="nueva-intervencion-title">
              Nueva intervención
            </DialogTitle>
          </DialogHeader>

          {!entityId ? (
            <div className="space-y-3">
              {/* Step 1 — scope selector */}
              <div className="flex gap-2" role="group" aria-label="Tipo de entidad">
                <Button
                  variant={scope === "persona" ? "default" : "outline"}
                  size="sm"
                  type="button"
                  aria-pressed={scope === "persona"}
                  onClick={() => {
                    setScope("persona");
                    setSearch("");
                  }}
                >
                  Para una persona
                </Button>
                <Button
                  variant={scope === "familia" ? "default" : "outline"}
                  size="sm"
                  type="button"
                  aria-pressed={scope === "familia"}
                  onClick={() => {
                    setScope("familia");
                    setSearch("");
                  }}
                >
                  Para una familia
                </Button>
              </div>

              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  scope === "persona"
                    ? "Buscar persona..."
                    : "Buscar familia..."
                }
                aria-label={
                  scope === "persona" ? "Buscar persona" : "Buscar familia"
                }
              />

              {scope === "persona" && personSearch.data && personSearch.data.length > 0 && (
                <div
                  className="border rounded max-h-60 overflow-y-auto"
                  role="listbox"
                  aria-label="Resultados de búsqueda de personas"
                >
                  {personSearch.data.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="w-full text-left p-2 hover:bg-muted text-sm focus:outline-none focus:bg-muted"
                      onClick={() => setEntityId(p.id)}
                    >
                      {p.nombre} {p.apellidos}
                    </button>
                  ))}
                </div>
              )}

              {scope === "familia" && familiaSearch.data && familiaSearch.data.length > 0 && (
                <div
                  className="border rounded max-h-60 overflow-y-auto"
                  role="listbox"
                  aria-label="Resultados de búsqueda de familias"
                >
                  {(familiaSearch.data as RawFamiliaRow[]).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="w-full text-left p-2 hover:bg-muted text-sm focus:outline-none focus:bg-muted"
                      onClick={() => setEntityId(f.id)}
                    >
                      {f.familia_numero ? `#${f.familia_numero} · ` : ""}
                      {f.persons?.nombre} {f.persons?.apellidos}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <NuevaIntervencionForm
              scope={scope}
              entityId={entityId}
              programaId={programaId}
              onSaved={(hojaId) => {
                setNewOpen(false);
                resetNewDialog();
                setDrawerHojaId(hojaId);
              }}
              onCancel={() => {
                setEntityId(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
