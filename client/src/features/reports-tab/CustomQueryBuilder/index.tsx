/**
 * CustomQueryBuilder/index.tsx — Compose pickers + PreviewPane.
 *
 * State: local useState only — NO Zustand.
 * URL params: saved query sharing is handled in SavedQueriesList (run-from-saved).
 *
 * Flow: entity → field → operator → value → execute → preview/export.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { REPORT_ENTITIES, ENTITY_FIELDS, type ReportEntity } from "@shared/reports/entities";
import { SavedQuerySpecSchema, type SavedQuerySpec } from "@shared/reports/savedQuerySpec";
import { FieldPicker } from "./FieldPicker";
import { OperatorPicker } from "./OperatorPicker";
import { GroupByPicker } from "./GroupByPicker";
import { PreviewPane } from "./PreviewPane";

const ENTITY_LABELS: Record<ReportEntity, string> = {
  families: "Familias",
  persons: "Personas",
  miembros: "Miembros",
  documents: "Documentos",
  deliveries: "Entregas",
};

interface CustomQueryBuilderProps {
  initialSpec?: Partial<SavedQuerySpec>;
}

export function CustomQueryBuilder({ initialSpec }: CustomQueryBuilderProps) {
  const [entity, setEntity] = useState<ReportEntity>(
    (initialSpec?.entity as ReportEntity) ?? "families",
  );
  const [filterField, setFilterField] = useState<string>("");
  const [filterOp, setFilterOp] = useState<string>("eq");
  const [filterValue, setFilterValue] = useState<string>("");
  const [groupBy, setGroupBy] = useState<string | undefined>(initialSpec?.groupBy);
  const [limit, setLimit] = useState<number>(initialSpec?.limit ?? 1000);
  const [runSpec, setRunSpec] = useState<SavedQuerySpec | null>(null);

  const executeQuery = trpc.reports.execute.useQuery(
    runSpec as SavedQuerySpec,
    { enabled: runSpec !== null },
  );

  const selectedFieldDef = ENTITY_FIELDS[entity].find((f) => f.name === filterField);

  function handleExecute() {
    const specInput: SavedQuerySpec = {
      entity,
      filters: filterField && filterOp && filterValue
        ? [{ field: filterField, operator: filterOp as "eq", value: filterValue }]
        : [],
      groupBy: groupBy ?? undefined,
      limit,
    };
    const parsed = SavedQuerySpecSchema.safeParse(specInput);
    if (!parsed.success) return;
    setRunSpec(parsed.data);
  }

  function handleEntityChange(e: ReportEntity) {
    setEntity(e);
    setFilterField("");
    setFilterOp("eq");
    setFilterValue("");
    setGroupBy(undefined);
    setRunSpec(null);
  }

  return (
    <div className="space-y-4">
      {/* Entity selector */}
      <div className="space-y-1">
        <Label htmlFor="entity-select" className="text-xs">
          Entidad
        </Label>
        <Select value={entity} onValueChange={(v) => handleEntityChange(v as ReportEntity)}>
          <SelectTrigger id="entity-select" aria-label="Seleccionar entidad">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_ENTITIES.map((e) => (
              <SelectItem key={e} value={e}>
                {ENTITY_LABELS[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filter row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <FieldPicker entity={entity} value={filterField} onChange={setFilterField} />
        {selectedFieldDef && (
          <OperatorPicker
            fieldType={selectedFieldDef.type}
            value={filterOp}
            onChange={(op) => setFilterOp(op)}
          />
        )}
        {filterField && (
          <div className="space-y-1">
            <Label htmlFor="filter-value" className="text-xs">
              Valor
            </Label>
            <Input
              id="filter-value"
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              placeholder="Valor del filtro…"
              aria-label="Valor del filtro"
            />
          </div>
        )}
      </div>

      {/* GroupBy + limit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <GroupByPicker
          entity={entity}
          value={groupBy ?? ""}
          onChange={setGroupBy}
        />
        <div className="space-y-1">
          <Label htmlFor="limit-input" className="text-xs">
            Límite de filas
          </Label>
          <Input
            id="limit-input"
            type="number"
            min={1}
            max={10000}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            aria-label="Límite de filas"
          />
        </div>
      </div>

      <Button onClick={handleExecute} aria-label="Ejecutar consulta">
        Ejecutar
      </Button>

      <PreviewPane
        rows={executeQuery.data?.rows as Record<string, unknown>[] | undefined}
        total={executeQuery.data?.total}
        isLoading={executeQuery.isLoading}
        error={executeQuery.error}
        filename={`bocatas_${entity}_consulta.csv`}
      />
    </div>
  );
}
