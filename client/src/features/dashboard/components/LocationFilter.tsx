/**
 * LocationFilter — All + 3 locations dropdown.
 * Loads locations from tRPC checkin.getLocations.
 */
import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LocationFilterProps {
  value: string;
  onChange: (locationId: string) => void;
}

export function LocationFilter({ value, onChange }: LocationFilterProps) {
  const { data: locations, isLoading } = trpc.checkin.getLocations.useQuery(undefined, {
    staleTime: 5 * 60_000, // 5 min
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading}>
      <SelectTrigger className="w-[140px] text-xs h-8" aria-label="Sede">
        <SelectValue placeholder="Todas las sedes" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todas las sedes</SelectItem>
        {(locations ?? []).map((loc) => (
          <SelectItem key={loc.id} value={loc.id}>
            {loc.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
