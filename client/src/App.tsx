import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useEffect } from "react";
import { useSupabaseAuth } from "@/lib/supabase/useSupabaseAuth";

// Pages
import Home from "./pages/Home";
import LoginPage from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import Personas from "./pages/Personas";
import Checkin from "./pages/Checkin";
import Dashboard from "./pages/Dashboard";
import AdminConsentimientos from "./pages/AdminConsentimientos";
import PersonasNueva from "./pages/PersonasNueva";
import PersonaDetalle from "./pages/PersonaDetalle";
import PersonaQR from "./pages/PersonaQR";
import AdminProgramas from "./pages/AdminProgramas";

// Layout
import ProtectedRoute from "./components/layout/ProtectedRoute";

/** Redirect /login → / when already authenticated */
function LoginGuard() {
  const { user, loading } = useSupabaseAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && user) navigate("/");
  }, [loading, user, navigate]);

  if (loading) return null;
  if (user) return null;
  return <LoginPage />;
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login" component={LoginGuard} />
      <Route path="/auth/callback" component={AuthCallback} />

      {/* Protected routes */}
      <Route path="/">
        <ProtectedRoute>
          <Home />
        </ProtectedRoute>
      </Route>
      <Route path="/personas">
        <ProtectedRoute>
          <Personas />
        </ProtectedRoute>
      </Route>
      <Route path="/personas/nueva">
        <ProtectedRoute>
          <PersonasNueva />
        </ProtectedRoute>
      </Route>
      <Route path="/personas/:id/qr">
        <ProtectedRoute>
          <PersonaQR />
        </ProtectedRoute>
      </Route>
      <Route path="/personas/:id">
        <ProtectedRoute>
          <PersonaDetalle />
        </ProtectedRoute>
      </Route>
      <Route path="/checkin">
        <ProtectedRoute>
          <Checkin />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/consentimientos">
        <ProtectedRoute requiredRoles={["superadmin"]}>
          <AdminConsentimientos />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/programas">
        <ProtectedRoute requiredRoles={["superadmin"]}>
          <AdminProgramas />
        </ProtectedRoute>
      </Route>

      {/* Fallback */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
