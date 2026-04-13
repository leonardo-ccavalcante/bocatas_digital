/**
 * DeliveryRecorder.tsx — D-F2: Reusable building block for recording food/item deliveries.
 * Used by Task 6 (Familia program — Banco de Alimentos deliveries).
 *
 * Receives familyContext to pre-populate and show reference.
 * Helps coordinadora calculate expected kg allocation based on family composition.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Package, Users, ChevronDown, ChevronUp } from "lucide-react";

export interface FamilyContext {
  /** Number of adults in the family */
  num_adultos: number;
  /** Number of minors under 18 */
  num_menores_18: number;
  /** Person authorized to pick up (pre-populates recogido_por, editable) */
  persona_recoge: string | null;
  /** Whether the person is authorized (pre-checks es_autorizado, editable) */
  autorizado: boolean;
}

export interface DeliveryRecord {
  fecha: string;
  recogido_por: string;
  es_autorizado: boolean;
  kg_entregados: number | null;
  lotes: number | null;
  notas: string;
}

interface DeliveryRecorderProps {
  familyContext?: FamilyContext;
  onSave: (record: DeliveryRecord) => void | Promise<void>;
  isSaving?: boolean;
  className?: string;
}

export function DeliveryRecorder({
  familyContext,
  onSave,
  isSaving = false,
  className,
}: DeliveryRecorderProps) {
  const today = new Date().toISOString().split("T")[0];
  const [expanded, setExpanded] = useState(true);
  const [record, setRecord] = useState<DeliveryRecord>({
    fecha: today,
    recogido_por: familyContext?.persona_recoge ?? "",
    es_autorizado: familyContext?.autorizado ?? false,
    kg_entregados: null,
    lotes: null,
    notas: "",
  });

  const totalPersons =
    (familyContext?.num_adultos ?? 0) + (familyContext?.num_menores_18 ?? 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(record);
  };

  return (
    <div className={cn("rounded-lg border", className)}>
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Registrar entrega</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-4 border-t pt-4">
          {/* Family composition reference (read-only) */}
          {familyContext && (
            <div className="rounded-md bg-muted/40 px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4 shrink-0" />
              <span>
                Composición familiar:{" "}
                <strong className="text-foreground">
                  {familyContext.num_adultos} adulto
                  {familyContext.num_adultos !== 1 ? "s" : ""}
                </strong>
                {familyContext.num_menores_18 > 0 && (
                  <>
                    ,{" "}
                    <strong className="text-foreground">
                      {familyContext.num_menores_18} menor
                      {familyContext.num_menores_18 !== 1 ? "es" : ""}
                    </strong>
                  </>
                )}
                {" "}({totalPersons} persona{totalPersons !== 1 ? "s" : ""} en total)
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="delivery-fecha" className="text-xs">
                Fecha *
              </Label>
              <Input
                id="delivery-fecha"
                type="date"
                value={record.fecha}
                onChange={(e) => setRecord((r) => ({ ...r, fecha: e.target.value }))}
                required
                className="h-8 text-sm"
              />
            </div>

            {/* Lotes */}
            <div className="space-y-1.5">
              <Label htmlFor="delivery-lotes" className="text-xs">
                Lotes
              </Label>
              <Input
                id="delivery-lotes"
                type="number"
                min={0}
                step={1}
                placeholder="0"
                value={record.lotes ?? ""}
                onChange={(e) =>
                  setRecord((r) => ({
                    ...r,
                    lotes: e.target.value ? parseInt(e.target.value, 10) : null,
                  }))
                }
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Kg entregados */}
          <div className="space-y-1.5">
            <Label htmlFor="delivery-kg" className="text-xs">
              Kg entregados
            </Label>
            <Input
              id="delivery-kg"
              type="number"
              min={0}
              step={0.1}
              placeholder="0.0"
              value={record.kg_entregados ?? ""}
              onChange={(e) =>
                setRecord((r) => ({
                  ...r,
                  kg_entregados: e.target.value ? parseFloat(e.target.value) : null,
                }))
              }
              className="h-8 text-sm"
            />
          </div>

          {/* Recogido por */}
          <div className="space-y-1.5">
            <Label htmlFor="delivery-recogido" className="text-xs">
              Recogido por *
            </Label>
            <Input
              id="delivery-recogido"
              type="text"
              placeholder="Nombre de quien recoge"
              value={record.recogido_por}
              onChange={(e) => setRecord((r) => ({ ...r, recogido_por: e.target.value }))}
              required
              className="h-8 text-sm"
            />
          </div>

          {/* Es autorizado */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="delivery-autorizado"
              checked={record.es_autorizado}
              onCheckedChange={(checked) =>
                setRecord((r) => ({ ...r, es_autorizado: checked === true }))
              }
            />
            <Label htmlFor="delivery-autorizado" className="text-sm cursor-pointer">
              Persona autorizada para recoger
            </Label>
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="delivery-notas" className="text-xs">
              Notas
            </Label>
            <Input
              id="delivery-notas"
              type="text"
              placeholder="Observaciones opcionales"
              value={record.notas}
              onChange={(e) => setRecord((r) => ({ ...r, notas: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={isSaving || !record.recogido_por || !record.fecha}
            className="w-full"
          >
            {isSaving ? "Guardando..." : "Registrar entrega"}
          </Button>
        </form>
      )}
    </div>
  );
}
