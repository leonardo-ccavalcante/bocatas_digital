/**
 * CrearNovedadButton.tsx — Authoring entry point rendered on /novedades.
 * Visible only to admin/superadmin. Exposes two actions:
 *   1. "Nueva novedad"  → navigates to /admin/novedades (full single-create form)
 *   2. "Importar lote"  → opens BulkImportNovedadesModal in-place
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import type { BocatasRole } from "@/components/layout/ProtectedRoute";
import { BulkImportNovedadesModal } from "@/components/BulkImportNovedadesModal";

const ADMIN_ROLES: BocatasRole[] = ["admin", "superadmin"];
const VALID_BOCATAS_ROLES: BocatasRole[] = [
  "superadmin",
  "admin",
  "voluntario",
  "beneficiario",
];

export function CrearNovedadButton() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [bulkOpen, setBulkOpen] = useState(false);

  const rawRole = user?.role as string | undefined;
  const role: BocatasRole =
    rawRole && VALID_BOCATAS_ROLES.includes(rawRole as BocatasRole)
      ? (rawRole as BocatasRole)
      : "beneficiario";

  if (!ADMIN_ROLES.includes(role)) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => navigate("/admin/novedades")}
          className="bg-[#C41230] hover:bg-[#A00E27] text-white gap-1.5"
          aria-label="Crear novedad"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Nueva novedad
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setBulkOpen(true)}
          className="border-[#C41230]/30 text-[#C41230] hover:bg-[#C41230]/5 gap-1.5"
          aria-label="Importar lote de novedades desde CSV"
        >
          <Upload className="w-4 h-4" aria-hidden="true" />
          Importar lote
        </Button>
      </div>
      <BulkImportNovedadesModal open={bulkOpen} onOpenChange={setBulkOpen} />
    </>
  );
}
