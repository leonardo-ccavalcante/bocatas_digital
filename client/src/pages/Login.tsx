import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Info } from "lucide-react";

/**
 * Login page — uses Manus OAuth as the single authentication method.
 * Manus OAuth supports Google, GitHub, and other providers configured
 * in the Manus platform. New users are automatically registered on first login.
 */
export default function LoginPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, loading } = useAuth();

  // If already authenticated, redirect to home
  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, loading, navigate]);

  const handleLogin = () => {
    // getLoginUrl() builds the Manus OAuth URL with the correct redirect_uri
    // pointing to /api/oauth/callback which is handled by the server template
    window.location.href = getLoginUrl();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" aria-label="Cargando..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-2 pb-4">
          <img
            src="/bocatas-logo.png"
            alt="Bocatas"
            className="h-20 w-20 rounded-full object-cover mx-auto mb-2"
            decoding="async"
            fetchPriority="high"
          />
          <CardTitle className="text-2xl font-bold text-amber-900">Bienvenidos a Bocatas Digital</CardTitle>
          <CardDescription className="text-amber-700 text-sm">
            La plataforma de gestión integral de Bocatas
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Button
            onClick={handleLogin}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium h-11"
            aria-label="Iniciar sesión con Manus"
          >
            Iniciar sesión
          </Button>

          <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 flex gap-3 items-start">
            <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-semibold block mb-1">¿Primera vez aquí?</span>
              Una vez que ingreses, podrás acceder a tu sistema de gestión para registros, seguimiento de participantes y más información. Si eres personal autorizado de Bocatas, tu cuenta se creará automáticamente. Para registrarte en nuestras bases de datos, contacta con el equipo de Bocatas.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
