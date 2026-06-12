/**
 * DerivarTab — main entry point for the /programas/:id?tab=derivar route.
 *
 * Composes DerivarList + HojaDrawer + NuevaIntervencionForm inside a Dialog.
 *
 * "Añadir intervención" flow (Batch 20 fix):
 * - When triggered from HojaDrawer (existing hoja), a choice dialog appears:
 *     A) Añadir al mismo documento → opens NuevaIntervencionForm with existingHojaId
 *     B) Crear nuevo documento     → opens the full wizard (Step 1: pick person/family)
 * - When triggered from the top "Nueva intervención" button, the full wizard runs.
 *
 * NuevaIntervencionForm now accepts an optional `existingHojaId` prop.
 * When provided, it skips Step 1 (entity search) and goes directly to the form.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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

// Mode for the new intervention dialog
type NewIntervencionMode =
  | { type: "closed" }
  | { type: "choice"; hojaId: string }          // ask same/new doc
  | { type: "wizard" }                           // full wizard (Step 1 + Step 2)
  | { type: "append"; hojaId: string };          // append to existing hoja directly

export default function DerivarTab({ programaId }: DerivarTabProps) {
  const [drawerHojaId, setDrawerHojaId] = useState<string | null>(null);
  const [mode, setMode] = useState<NewIntervencionMode>({ type: "closed" });
  const [scope, setScope] = useState<Scope>("persona");
  const [search, setSearch] = useState("");
  const [entityId, setEntityId] = useState<string | null>(null);

  // persons.search uses `query` param (min 2 chars)
  const personSearch = trpc.persons.search.useQuery(
    { query: search },
    { enabled: mode.type === "wizard" && scope === "persona" && search.length >= 2 },
  );

  // families.getAll supports search + estado params
  const familiaSearch = trpc.families.getAll.useQuery(
    { search, estado: "all" },
    { enabled: mode.type === "wizard" && scope === "familia" && search.length >= 2 },
  );

  const resetWizard = () => {
    setEntityId(null);
    setSearch("");
    setScope("persona");
  };

  const closeAll = () => {
    setMode({ type: "closed" });
    resetWizard();
  };

  // Called from HojaDrawer's "Añadir intervención" button
  const handleAddFromDrawer = (hId: string) => {
    setMode({ type: "choice", hojaId: hId });
  };

  // User chose "same document" in the choice dialog
  const handleChoiceSameDoc = (hojaId: string) => {
    setMode({ type: "append", hojaId });
  };

  // User chose "new document" in the choice dialog
  const handleChoiceNewDoc = () => {
    setDrawerHojaId(null);
    resetWizard();
    setMode({ type: "wizard" });
  };

  const isDialogOpen =
    mode.type === "choice" ||
    mode.type === "wizard" ||
    mode.type === "append";

  const dialogTitle =
    mode.type === "choice"
      ? "Añadir intervención"
      : mode.type === "append"
        ? "Nueva intervención (mismo documento)"
        : "Nueva intervención";

  return (
    <div className="space-y-3 p-4">
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => {
            resetWizard();
            setMode({ type: "wizard" });
          }}
        >
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          Nueva intervención
        </Button>
      </div>

      <DerivarList programaId={programaId} onRowClick={setDrawerHojaId} />

      <HojaDrawer
        hojaId={drawerHojaId}
        onClose={() => setDrawerHojaId(null)}
        onAddIntervention={handleAddFromDrawer}
      />

      {/* ── Nueva intervención dialog ─────────────────────────────────────────── */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeAll();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          {/* ── Choice: same doc vs new doc ─────────────────────────────────── */}
          {mode.type === "choice" && (
            <div className="space-y-4 py-2">
              <DialogDescription>
                ¿Quieres añadir esta intervención al documento actual o crear un nuevo documento?
              </DialogDescription>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => handleChoiceSameDoc(mode.hojaId)}
                >
                  Añadir al mismo documento
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleChoiceNewDoc}
                >
                  Crear nuevo documento
                </Button>
              </div>
            </div>
          )}

          {/* ── Append to existing hoja (skip entity search) ─────────────────── */}
          {mode.type === "append" && (
            <NuevaIntervencionForm
              scope={scope}
              entityId=""
              programaId={programaId}
              existingHojaId={mode.hojaId}
              onSaved={(hojaId) => {
                closeAll();
                setDrawerHojaId(hojaId);
              }}
              onCancel={closeAll}
            />
          )}

          {/* ── Full wizard (Step 1: entity search + Step 2: form) ───────────── */}
          {mode.type === "wizard" && (
            <>
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
                      scope === "persona" ? "Buscar persona..." : "Buscar familia..."
                    }
                    aria-label={scope === "persona" ? "Buscar persona" : "Buscar familia"}
                  />

                  {scope === "persona" &&
                    personSearch.data &&
                    personSearch.data.length > 0 && (
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
                            className="w-full text-left p-2 hover:bg-muted text-sm focus:outline-none focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
                            onClick={() => setEntityId(p.id)}
                          >
                            {p.nombre} {p.apellidos}
                          </button>
                        ))}
                      </div>
                    )}

                  {scope === "familia" &&
                    familiaSearch.data &&
                    familiaSearch.data.length > 0 && (
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
                            className="w-full text-left p-2 hover:bg-muted text-sm focus:outline-none focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
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
                    closeAll();
                    setDrawerHojaId(hojaId);
                  }}
                  onCancel={() => setEntityId(null)}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
