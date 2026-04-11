import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

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
          <div className="text-5xl mb-2" role="img" aria-label="Pan bocata">🥖</div>
          <CardTitle className="text-2xl font-bold text-amber-900">Bocatas Digital</CardTitle>
          <CardDescription className="text-amber-700">
            Plataforma de gestión del comedor social
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

          <p className="text-xs text-center text-muted-foreground leading-relaxed">
            Si es tu primera vez, se creará tu cuenta automáticamente.
            <br />
            El acceso está restringido a personal autorizado de Bocatas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
