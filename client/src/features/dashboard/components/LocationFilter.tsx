/**
 * LocationFilter — v4 restyle: rounded-full pill select matching prototype.
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
    staleTime: 5 * 60_000,
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading}>
      <SelectTrigger
        className="text-xs font-medium h-8 rounded-full border-border bg-card shrink-0 px-3 min-w-[140px]"
        aria-label="Sede"
      >
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
