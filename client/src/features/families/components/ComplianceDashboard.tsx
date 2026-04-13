import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle, Users, FileText, Shield, Clock } from "lucide-react";
import { useComplianceStats, usePendingItems } from "../hooks/useFamilias";

interface StatCardProps {
  title: string;
  description: string;
  value: number;
  icon: React.ElementType;
  variant?: "default" | "warning" | "danger" | "success";
}

function StatCard({ title, description, value, icon: Icon, variant = "default" }: StatCardProps) {
  const colorMap = {
    default: "text-primary",
    warning: "text-yellow-600",
    danger: "text-red-600",
    success: "text-green-600",
  };
  const bgMap = {
    default: "",
    warning: value > 0 ? "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20" : "",
    danger: value > 0 ? "border-red-200 bg-red-50 dark:bg-red-950/20" : "",
    success: "border-green-200",
  };

  return (
    <Card className={bgMap[variant]}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            <p className={`text-3xl font-bold mt-1 ${colorMap[variant]}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
          <Icon className={`h-5 w-5 mt-1 ${colorMap[variant]}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export function ComplianceDashboard() {
  const { data: stats, isLoading: statsLoading } = useComplianceStats();
  const { data: pending, isLoading: pendingLoading } = usePendingItems();

  if (statsLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  const totalIssues = (stats?.cm1 ?? 0) + (stats?.cm2 ?? 0) + (stats?.cm3 ?? 0) + (stats?.cm4 ?? 0) + (stats?.cm5 ?? 0);

  return (
    <div className="space-y-6">
      {/* Summary banner */}
      {totalIssues === 0 ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <p className="text-sm text-green-700 dark:text-green-400 font-medium">
            Sin incidencias de cumplimiento
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <p className="text-sm text-yellow-700 dark:text-yellow-400 font-medium">
            {totalIssues} incidencias de cumplimiento activas
          </p>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          title="CM-1: Sin consentimiento BdeA"
          description="Familias sin consentimiento Banco de Alimentos"
          value={stats?.cm1 ?? 0}
          icon={CheckCircle}
          variant={stats?.cm1 ? "danger" : "success"}
        />
        <StatCard
          title="CM-2: Informe social caducado"
          description="Informes sociales con más de 330 días"
          value={stats?.cm2 ?? 0}
          icon={FileText}
          variant={stats?.cm2 ? "danger" : "success"}
        />
        <StatCard
          title="CM-3: GUF sin verificar"
          description="Sin alta GUF o verificación >30 días"
          value={stats?.cm3 ?? 0}
          icon={Shield}
          variant={stats?.cm3 ? "warning" : "success"}
        />
        <StatCard
          title="CM-4: Sesiones abiertas"
          description="Sesiones de programa sin cerrar"
          value={stats?.cm4 ?? 0}
          icon={Clock}
          variant={stats?.cm4 ? "warning" : "success"}
        />
        <StatCard
          title="CM-5: Sin entrega reciente"
          description="Sin entrega en los últimos 60 días"
          value={stats?.cm5 ?? 0}
          icon={Users}
          variant={stats?.cm5 ? "warning" : "success"}
        />
      </div>

      {/* CM-5 family list */}
      {stats?.cm5List && stats.cm5List.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Familias sin entrega reciente ({stats.cm5List.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {stats.cm5List.map((f) => {
                const person = f.persons as { nombre: string; apellidos: string | null; telefono: string | null } | null;
                return (
                  <div key={f.id} className="flex items-center justify-between p-2 border rounded text-sm">
                    <div>
                      <p className="font-medium">Familia #{f.familia_numero}</p>
                      {person && (
                        <p className="text-xs text-muted-foreground">
                          {person.nombre} {person.apellidos ?? ""}
                          {person.telefono ? ` · ${person.telefono}` : ""}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs">+60 días</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending member items */}
      {!pendingLoading && pending && pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Miembros con documentación pendiente ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pending.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 border rounded text-sm">
                  <div>
                    <p className="font-medium">{item.member_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Familia #{item.familia_numero} · {item.parentesco}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {item.missing.map((m) => (
                      <Badge key={m} variant="destructive" className="text-xs">
                        {m === "consent" ? "Consentimiento" : "Documento"}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
