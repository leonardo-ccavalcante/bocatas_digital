/**
 * OperatorPicker.tsx — Operators scoped to the selected field's type.
 *
 * Operator sets per type:
 *   string  → eq, neq, contains, is_null
 *   number  → eq, neq, gt, gte, lt, lte, between, is_null
 *   boolean → eq
 *   date    → eq, neq, gt, gte, lt, lte, between, is_null
 *   enum    → eq, neq, in
 */

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FieldDef } from "@shared/reports/entities";
import type { Operator } from "@shared/reports/savedQuerySpec";

const OPERATOR_LABELS: Record<Operator, string> = {
  eq: "es igual a",
  neq: "no es igual a",
  gt: "mayor que",
  gte: "mayor o igual que",
  lt: "menor que",
  lte: "menor o igual que",
  in: "es uno de",
  contains: "contiene",
  is_null: "está vacío",
  between: "entre",
};

function operatorsForType(type: FieldDef["type"]): Operator[] {
  switch (type) {
    case "string":
      return ["eq", "neq", "contains", "is_null"];
    case "number":
      return ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_null"];
    case "boolean":
      return ["eq"];
    case "date":
      return ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_null"];
    case "enum":
      return ["eq", "neq", "in"];
  }
}

interface OperatorPickerProps {
  fieldType: FieldDef["type"];
  value: string;
  onChange: (op: Operator) => void;
}

export function OperatorPicker({ fieldType, value, onChange }: OperatorPickerProps) {
  const ops = operatorsForType(fieldType);

  return (
    <div className="space-y-1">
      <Label htmlFor="operator-picker" className="text-xs">
        Operador
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as Operator)}>
        <SelectTrigger id="operator-picker" aria-label="Operador de filtro">
          <SelectValue placeholder="Seleccionar operador…" />
        </SelectTrigger>
        <SelectContent>
          {ops.map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
