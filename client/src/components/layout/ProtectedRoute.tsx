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
  const { user, loading, isAuthenticated, isUnauthenticated, refresh } = useAuth();
  const [, navigate] = useLocation();

  // Redirect to login ONLY when definitively unauthenticated — never on a
  // transient error (e.g. a rate-limit 429), which used to log out a whole
  // sede (#166).
  useEffect(() => {
    if (!loading && isUnauthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [loading, isUnauthenticated]);

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

  // Definitively unauthenticated → the effect above is redirecting to login.
  if (isUnauthenticated) return null;

  // Not logged out, but auth.me is failing transiently (rate limit / network).
  // Offer a retry instead of bouncing to login and losing the session.
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <div className="text-center space-y-3 max-w-xs px-4">
          <p className="text-amber-800 font-medium">No se pudo cargar tu sesión.</p>
          <p className="text-sm text-amber-700">Puede ser una sobrecarga puntual. Vuelve a intentarlo.</p>
          <button
            onClick={() => void refresh()}
            className="rounded-md bg-amber-800 px-4 py-2 text-sm font-medium text-white min-h-[44px]"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (requiredRoles && !requiredRoles.includes(userRole)) return null;

  return <AppShell>{children}</AppShell>;
}
