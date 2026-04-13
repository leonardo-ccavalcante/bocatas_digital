/**
 * Perfil.tsx — Beneficiario personal profile page.
 * Shows user account data. Role: beneficiario (and all roles).
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Shield } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  beneficiario: "Beneficiario/a",
  voluntario: "Voluntario/a",
  admin: "Administrador/a",
  superadmin: "Superadministrador/a",
};

const ROLE_COLORS: Record<string, string> = {
  beneficiario: "bg-blue-100 text-blue-800 border-blue-200",
  voluntario: "bg-green-100 text-green-800 border-green-200",
  admin: "bg-orange-100 text-orange-800 border-orange-200",
  superadmin: "bg-red-100 text-red-800 border-red-200",
};

export default function Perfil() {
  const { user } = useAuth();
  const role = user?.role ?? "beneficiario";
  const initials = user?.name
    ?.split(" ")
    .map((n) => n.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "?";

  return (
    <div className="p-5 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#C41230] text-white flex items-center justify-center text-2xl font-bold shrink-0">
            {initials}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{user?.name ?? "Mi perfil"}</h1>
            <Badge className={ROLE_COLORS[role] ?? ROLE_COLORS.beneficiario}>
              {ROLE_LABELS[role] ?? role}
            </Badge>
          </div>
        </div>
      </header>

      <div className="space-y-4">
        {/* Account info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-[#C41230]" />
              Información de cuenta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Nombre</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">{user?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                <Mail className="h-3 w-3" /> Email
              </p>
              <p className="text-sm font-semibold text-foreground mt-0.5">{user?.email ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                <Shield className="h-3 w-3" /> Rol
              </p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {ROLE_LABELS[role] ?? role}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Info card */}
        <Card className="border-[#C41230]/20 bg-[#C41230]/5">
          <CardContent className="py-4">
            <p className="text-sm text-[#C41230] font-medium">
              Para actualizar tus datos personales (nombre, teléfono, dirección), contacta con el personal de Bocatas en tu sede.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
