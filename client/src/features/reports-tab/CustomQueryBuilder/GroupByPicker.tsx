/**
 * GroupByPicker.tsx — Shows ONLY groupable fields for the selected entity.
 *
 * Non-groupable fields are excluded from the rendered options.
 * Includes a "Sin agrupar" option to clear the groupBy.
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

interface GroupByPickerProps {
  entity: ReportEntity;
  value: string;
  onChange: (field: string | undefined) => void;
}

export function GroupByPicker({ entity, value, onChange }: GroupByPickerProps) {
  const groupable = ENTITY_FIELDS[entity].filter((f) => f.groupable);

  function handleChange(v: string) {
    onChange(v === NONE_VALUE ? undefined : v);
  }

  return (
    <div className="space-y-1">
      <Label htmlFor="groupby-picker" className="text-xs">
        Agrupar por
      </Label>
      <Select value={value || NONE_VALUE} onValueChange={handleChange}>
        <SelectTrigger id="groupby-picker" aria-label="Agrupar resultados por campo">
          <SelectValue placeholder="Sin agrupar" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>Sin agrupar</SelectItem>
          {groupable.map((f) => (
            <SelectItem key={f.name} value={f.name}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
