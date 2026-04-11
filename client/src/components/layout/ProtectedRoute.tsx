import { useEffect } from "react";
import { useLocation } from "wouter";
import { useSupabaseAuth, type BocatasRole } from "@/lib/supabase/useSupabaseAuth";
import { Loader2 } from "lucide-react";
import AppShell from "./AppShell";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: BocatasRole[];
}

export default function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, loading } = useSupabaseAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && user && requiredRoles && !requiredRoles.includes(user.role)) {
      navigate("/");
    }
  }, [loading, user, requiredRoles, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600 mx-auto" />
          <p className="text-amber-800 font-medium">Cargando…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (requiredRoles && !requiredRoles.includes(user.role)) return null;

  return <AppShell>{children}</AppShell>;
}
