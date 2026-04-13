import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";

// Pages
import { lazy, Suspense } from "react";
import Home from "./pages/Home";
import LoginPage from "./pages/Login";
import Personas from "./pages/Personas";
import CheckIn from "./pages/CheckIn";
// Lazy-load Dashboard to keep initial bundle < 300KB (recharts is ~100KB gzip)
const Dashboard = lazy(() => import("./pages/Dashboard"));
import AdminConsentimientos from "./pages/AdminConsentimientos";
import PersonasNueva from "./pages/PersonasNueva";
import PersonaDetalle from "./pages/PersonaDetalle";
import PersonaQR from "./pages/PersonaQR";
import AdminProgramas from "./pages/AdminProgramas";
import Programas from "./pages/Programas";
import ProgramaDetalle from "./pages/ProgramaDetalle";
import AdminUsuarios from "./pages/AdminUsuarios";
import FamiliasList from "./pages/FamiliasList";
import FamiliaRegistro from "./pages/FamiliaRegistro";
import FamiliaDetalle from "./pages/FamiliaDetalle";
import FamiliasCompliance from "./pages/FamiliasCompliance";

// Layout
import ProtectedRoute from "./components/layout/ProtectedRoute";

/** Redirect /login → / when already authenticated */
function LoginGuard() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/");
  }, [loading, isAuthenticated, navigate]);

  if (loading) return null;
  if (user) return null;
  return <LoginPage />;
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login" component={LoginGuard} />
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
          <CheckIn />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <Suspense fallback={<div className="flex items-center justify-center h-full min-h-[60vh]"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>}>
            <Dashboard />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/programas/:slug">
        <ProtectedRoute>
          <ProgramaDetalle />
        </ProtectedRoute>
      </Route>
      <Route path="/programas">
        <ProtectedRoute>
          <Programas />
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
      <Route path="/admin/usuarios">
        <ProtectedRoute requiredRoles={["superadmin"]}>
          <AdminUsuarios />
        </ProtectedRoute>
      </Route>

      {/* Familias module */}
      <Route path="/familias/nueva">
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <FamiliaRegistro />
        </ProtectedRoute>
      </Route>
      <Route path="/familias/cumplimiento">
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <FamiliasCompliance />
        </ProtectedRoute>
      </Route>
      <Route path="/familias/:id">
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <FamiliaDetalle />
        </ProtectedRoute>
      </Route>
      <Route path="/familias">
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <FamiliasList />
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
