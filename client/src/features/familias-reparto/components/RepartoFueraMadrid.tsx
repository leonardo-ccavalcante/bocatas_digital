import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  enabled: boolean;
  count: string;
  onToggle: () => void;
  onCount: (v: string) => void;
}

/** Toggle + count for beneficiaries served in a dedicated fuera-de-Madrid slot
 *  (the first turno). The count is carved out of the total; the rest (Madrid)
 *  rebalance across the other turnos. */
export function RepartoFueraMadrid({ enabled, count, onToggle, onCount }: Props) {
  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant={enabled ? "default" : "outline"}
        size="sm"
        aria-pressed={enabled}
        onClick={onToggle}
      >
        {enabled ? "✓ " : ""}Hay personas de fuera de Madrid
      </Button>
      {enabled && (
        <div className="space-y-1">
          <Label htmlFor="reparto-fuera" className="text-xs">
            ¿Cuántas? Van al primer turno.
          </Label>
          <Input
            id="reparto-fuera"
            type="number"
            min={1}
            step={1}
            placeholder="p. ej. 20"
            value={count}
            onChange={(e) => onCount(e.target.value)}
            className="h-9"
          />
        </div>
      )}
    </div>
  );
}
