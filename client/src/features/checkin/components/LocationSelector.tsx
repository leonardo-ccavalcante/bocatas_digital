/**
 * LocationSelector.tsx — Dropdown to select the active sede (location).
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface LocationSelectorProps {
  value: string | null;
  onChange: (locationId: string) => void;
}

export function LocationSelector({ value, onChange }: LocationSelectorProps) {
  const { data: locations, isLoading } = trpc.checkin.getLocations.useQuery();

  return (
    <div className="flex items-center gap-2">
      <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
      <Select
        value={value ?? ""}
        onValueChange={onChange}
        disabled={isLoading}
      >
        <SelectTrigger className="min-w-44">
          <SelectValue placeholder={isLoading ? "Cargando sedes..." : "Seleccionar sede..."} />
        </SelectTrigger>
        <SelectContent>
          {(locations ?? []).map((loc) => (
            <SelectItem key={loc.id} value={loc.id}>
              {loc.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
