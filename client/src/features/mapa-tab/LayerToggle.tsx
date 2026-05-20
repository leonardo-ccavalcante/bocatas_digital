/**
 * LayerToggle — shadcn ToggleGroup for switching between Densidad and Compliance
 * map layers. Uses ToggleGroup (Radix) so each option has proper aria-pressed state.
 */

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface LayerToggleProps {
  layer: "densidad" | "compliance";
  onChange: (layer: "densidad" | "compliance") => void;
}

export function LayerToggle({ layer, onChange }: LayerToggleProps) {
  function handleValueChange(value: string) {
    // ToggleGroup fires an empty string when the current item is clicked again
    // (deselection). We prevent deselection — exactly one layer must be active.
    if (value === "densidad" || value === "compliance") {
      onChange(value);
    }
  }

  return (
    <ToggleGroup
      type="single"
      value={layer}
      onValueChange={handleValueChange}
      variant="outline"
      aria-label="Capa del mapa"
    >
      <ToggleGroupItem value="densidad" aria-label="Densidad">
        Densidad
      </ToggleGroupItem>
      <ToggleGroupItem value="compliance" aria-label="Compliance">
        Compliance
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
