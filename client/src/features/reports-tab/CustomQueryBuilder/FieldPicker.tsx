/**
 * FieldPicker.tsx — Shows ONLY filterable fields for the selected entity.
 *
 * Non-filterable fields are excluded from the rendered options.
 * This is a client-side defense-in-depth check; the server allowlist is the
 * authoritative gate.
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

interface FieldPickerProps {
  entity: ReportEntity;
  value: string;
  onChange: (field: string) => void;
}

export function FieldPicker({ entity, value, onChange }: FieldPickerProps) {
  const filterable = ENTITY_FIELDS[entity].filter((f) => f.filterable);

  return (
    <div className="space-y-1">
      <Label htmlFor="field-picker" className="text-xs">
        Campo
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="field-picker" aria-label="Campo de filtro">
          <SelectValue placeholder="Seleccionar campo…" />
        </SelectTrigger>
        <SelectContent>
          {filterable.map((f) => (
            <SelectItem key={f.name} value={f.name}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
