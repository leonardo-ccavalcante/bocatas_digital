import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";

interface Props {
  label: string;
  addLabel: string;
  placeholder?: string;
  values: string[];
  onChange: (values: string[]) => void;
  max?: number;
}

/** Up-to-`max` repeatable text inputs (albaranes, facturas) with add / remove.
 *  Always renders at least one row; empty rows are dropped by the caller on submit. */
export function RepartoNumberList({ label, addLabel, placeholder, values, onChange, max = 4 }: Props) {
  const rows = values.length ? values : [""];
  const setAt = (i: number, v: string) => onChange(rows.map((x, j) => (j === i ? v : x)));
  const add = () => onChange([...rows, ""]);
  const removeAt = (i: number) => onChange(rows.filter((_, j) => j !== i));

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {rows.map((v, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={v}
            placeholder={placeholder}
            aria-label={`${label} ${i + 1}`}
            onChange={(e) => setAt(i, e.target.value)}
            className="h-9"
          />
          {rows.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Quitar"
              onClick={() => removeAt(i)}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      ))}
      {rows.length < max && (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> {addLabel}
        </Button>
      )}
    </div>
  );
}
