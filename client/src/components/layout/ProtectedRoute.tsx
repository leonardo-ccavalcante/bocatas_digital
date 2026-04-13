import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Loader2 } from "lucide-react";
import AppShell from "./AppShell";

/**
 * Valid Bocatas roles stored in user.role via Manus OAuth metadata.
 * The role is set in the Manus platform user profile or defaulted to "voluntario".
 */
export type BocatasRole = "superadmin" | "admin" | "voluntario" | "beneficiario";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If provided, only users with one of these roles can access the route */
  requiredRoles?: BocatasRole[];
}

export default function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  // Redirect to Manus OAuth login if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [loading, isAuthenticated]);

  // Normalize role: Manus OAuth default is "user" — map to "beneficiario" as safe fallback.
  const VALID_BOCATAS_ROLES: BocatasRole[] = ["superadmin", "admin", "voluntario", "beneficiario"];
  const rawRole = user?.role as string | undefined;
  const userRole: BocatasRole = (rawRole && VALID_BOCATAS_ROLES.includes(rawRole as BocatasRole))
    ? (rawRole as BocatasRole)
    : "beneficiario";

  // Redirect to home if authenticated but lacks required role
  useEffect(() => {
    if (!loading && isAuthenticated && requiredRoles && !requiredRoles.includes(userRole)) {
      navigate("/");
    }
  }, [loading, isAuthenticated, requiredRoles, userRole, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600 mx-auto" aria-label="Cargando..." />
          <p className="text-amber-800 font-medium">Cargando…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (requiredRoles && !requiredRoles.includes(userRole)) return null;

  return <AppShell>{children}</AppShell>;
}
