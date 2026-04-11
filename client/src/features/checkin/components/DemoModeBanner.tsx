/**
 * DemoModeBanner.tsx — Prominent warning shown when demo mode is active.
 * In demo mode, check-ins are NOT saved to the database.
 */
import { AlertTriangle } from "lucide-react";

export function DemoModeBanner() {
  return (
    <div className="w-full rounded-lg bg-amber-50 border border-amber-300 px-4 py-2 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      <p className="text-sm font-medium text-amber-800">
        Modo Demo activo — los check-ins no se guardan en la base de datos
      </p>
    </div>
  );
}
