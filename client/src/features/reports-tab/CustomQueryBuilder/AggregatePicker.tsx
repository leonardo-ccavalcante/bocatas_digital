/**
 * AggregatePicker.tsx — Pick an aggregation (operation + field).
 *
 * Flattens the per-field `aggregable` allowlist into one select: each option
 * is a valid (op, field) pair, e.g. "Conteo de ID", "Suma de Núm. adultos".
 * Non-aggregable fields never appear. Pairs with GroupByPicker — a grouped
 * aggregate (groupBy + aggregate) is what the server's customQuery executor
 * actually computes, and what the k-anonymity export toggle gates on.
 *
 * Value wire format: `${op}:${field}` (or "" for "Sin agregación").
 */

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ENTITY_FIELDS, type ReportEntity } from "@shared/reports/entities";

const NONE_VALUE = "__none__";

type AggOp = "count" | "sum" | "avg" | "min" | "max";

const OP_LABELS: Record<AggOp, string> = {
  count: "Conteo",
  sum: "Suma",
  avg: "Promedio",
  min: "Mínimo",
  max: "Máximo",
};

export interface AggregateValue {
  op: AggOp;
  field: string;
}

interface AggregatePickerProps {
  entity: ReportEntity;
  /** Wire value `${op}:${field}` or "" for none. */
  value: string;
  onChange: (aggregate: AggregateValue | undefined) => void;
}

export interface AggOption {
  value: string;
  label: string;
}

/** Flatten ENTITY_FIELDS into valid (op, field) options. Exported for unit tests. */
export function aggregateOptions(entity: ReportEntity): AggOption[] {
  const options: AggOption[] = [];
  for (const field of ENTITY_FIELDS[entity]) {
    if (!field.aggregable) continue;
    for (const op of field.aggregable) {
      options.push({
        value: `${op}:${field.name}`,
        label: `${OP_LABELS[op]} de ${field.label}`,
      });
    }
  }
  return options;
}

export function AggregatePicker({ entity, value, onChange }: AggregatePickerProps) {
  const options = aggregateOptions(entity);

  function handleChange(v: string) {
    if (v === NONE_VALUE) {
      onChange(undefined);
      return;
    }
    const [op, field] = v.split(":");
    onChange({ op: op as AggOp, field });
  }

  return (
    <div className="space-y-1">
      <Label htmlFor="aggregate-picker" className="text-xs">
        Agregación
      </Label>
      <Select value={value || NONE_VALUE} onValueChange={handleChange}>
        <SelectTrigger id="aggregate-picker" aria-label="Función de agregación">
          <SelectValue placeholder="Sin agregación" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>Sin agregación</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
