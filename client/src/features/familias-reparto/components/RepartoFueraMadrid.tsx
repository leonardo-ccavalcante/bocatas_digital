import { Button } from "@/components/ui/button";

interface Props {
  enabled: boolean;
  onToggle: () => void;
}

/** Toggle that marks the first selected turno as the reserved fuera-de-Madrid slot.
 *  The engine (server-side) gives fuera-de-Madrid families priority on that slot.
 *  Cupos are reference-only — no count input needed here. */
export function RepartoFueraMadrid({ enabled, onToggle }: Props) {
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
        <p className="text-xs text-muted-foreground">
          El primer turno queda reservado para estas familias (detectadas por código postal).
        </p>
      )}
    </div>
  );
}
