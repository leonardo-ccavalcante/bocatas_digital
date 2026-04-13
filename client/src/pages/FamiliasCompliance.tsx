import { ComplianceDashboard } from "@/features/families/components/ComplianceDashboard";
import { BarChart3 } from "lucide-react";

export default function FamiliasCompliance() {
  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Cumplimiento — Programa de Familias</h1>
          <p className="text-sm text-muted-foreground">
            Métricas de cumplimiento normativo (CM-1 a CM-5)
          </p>
        </div>
      </div>
      <ComplianceDashboard />
    </div>
  );
}
