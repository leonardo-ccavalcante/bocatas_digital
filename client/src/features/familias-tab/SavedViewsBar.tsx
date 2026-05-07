import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFamilySavedViews } from "./hooks/useFamilySavedViews";
import { useFamiliasFilters, type FamiliasFilters } from "./hooks/useFamiliasFilters";

interface SavedViewsBarProps {
  programaId: string;
}

interface SavedViewRow {
  id: string;
  nombre: string;
  is_shared: boolean | null;
  filters_json: unknown;
}

/**
 * Coerces an opaque jsonb value back to a FamiliasFilters partial. Drops
 * unknown keys silently (defense-in-depth: server already validates the
 * shape via Zod .strict() on insert/update).
 */
function safeFiltersFromJson(value: unknown): Partial<FamiliasFilters> {
  if (typeof value !== "object" || value === null) return {};
  const v = value as Record<string, unknown>;
  const out: Partial<FamiliasFilters> = {};
  if (typeof v.search === "string") out.search = v.search;
  if (v.estado === "activa" || v.estado === "baja" || v.estado === "all") {
    out.estado = v.estado;
  }
  if (typeof v.sinGuf === "boolean") out.sinGuf = v.sinGuf;
  if (typeof v.sinInformeSocial === "boolean") out.sinInformeSocial = v.sinInformeSocial;
  if (typeof v.distrito === "string") out.distrito = v.distrito;
  return out;
}

export function SavedViewsBar({ programaId }: SavedViewsBarProps) {
  const { list, create, remove } = useFamilySavedViews(programaId);
  const { filters, applyFilters } = useFamiliasFilters();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync({
        programaId,
        nombre: trimmed,
        filtersJson: {
          search: filters.search,
          estado: filters.estado,
          sinGuf: filters.sinGuf,
          sinInformeSocial: filters.sinInformeSocial,
          distrito: filters.distrito,
        },
        isShared: shared,
      });
      setName("");
      setShared(false);
      setOpen(false);
      toast.success("Vista guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar la vista");
    }
  };

  const onApply = (row: SavedViewRow) => {
    const partial = safeFiltersFromJson(row.filters_json);
    applyFilters(partial);
  };

  const onRemove = async (id: string) => {
    try {
      await remove.mutateAsync({ id });
      toast.success("Vista eliminada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar la vista");
    }
  };

  const rows = (list.data ?? []) as SavedViewRow[];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground mr-1">Vistas:</span>
      {rows.map((v) => (
        <div key={v.id} className="inline-flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onApply(v)}
            aria-label={`Aplicar vista ${v.nombre}`}
          >
            {v.is_shared && (
              <Star
                className="h-3 w-3 mr-1 fill-current"
                aria-label="Compartida"
              />
            )}
            {v.nombre}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onRemove(v.id)}
            disabled={remove.isPending}
            aria-label={`Eliminar vista ${v.nombre}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            <Plus className="h-4 w-4 mr-1" /> Nueva vista
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar filtros como vista</DialogTitle>
            <DialogDescription>
              Ponle un nombre a los filtros actuales para guardarlos como vista rápida.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="view-name">Nombre</Label>
              <Input
                id="view-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Familias activas"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="shared"
                checked={shared}
                onCheckedChange={(v) => setShared(v === true)}
              />
              <Label htmlFor="shared" className="cursor-pointer">
                Compartir con otros administradores
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={onSave}
              disabled={!name.trim() || create.isPending}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
