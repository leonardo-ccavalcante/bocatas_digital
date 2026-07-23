import { Users } from "lucide-react";

interface Props {
  familias: number;
  personas: number;
  isLoading: boolean;
}

/** Live banner showing how many active families will be automatically included
 *  in the reparto. Families are derived server-side; the operator does not pick
 *  them. role="status" + aria-live so screen readers announce updates. */
export function RepartoFamiliasIncluidas({ familias, personas, isLoading }: Props) {
  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        Contando familias activas…
      </p>
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm"
    >
      <Users className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
      <span className="text-blue-800">
        Se incluirán <strong>{familias}</strong> familia{familias !== 1 ? "s" : ""} activas
        {personas > 0 ? ` (${personas} personas)` : ""}
      </span>
    </div>
  );
}
