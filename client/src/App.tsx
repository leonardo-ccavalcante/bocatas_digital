import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useEffect, lazy, Suspense } from "react";
import { useAuth } from "@/_core/hooks/useAuth";

// Layout
import ProtectedRoute from "./components/layout/ProtectedRoute";

// ─── Eager (small, always needed) ────────────────────────────────────────────
import Home from "./pages/Home";
import LoginPage from "./pages/Login";

// ─── Lazy (code-split by route) ───────────────────────────────────────────────
// Personas
const Personas = lazy(() => import("./pages/Personas"));
const PersonasNueva = lazy(() => import("./pages/PersonasNueva"));
const PersonaDetalle = lazy(() => import("./pages/PersonaDetalle"));
const PersonaQR = lazy(() => import("./pages/PersonaQR"));

// Check-in
const CheckIn = lazy(() => import("./pages/CheckIn"));

const Dashboard = lazy(() => import("./pages/Dashboard"));

// Programas
const Programas = lazy(() => import("./pages/Programas"));
const ProgramaDetalle = lazy(() => import("./pages/ProgramaDetalle"));

// Admin
const AdminConsentimientos = lazy(() => import("./pages/AdminConsentimientos"));
const AdminProgramas = lazy(() => import("./pages/AdminProgramas"));
const AdminUsuarios = lazy(() => import("./pages/AdminUsuarios"));
const AdminNovedades = lazy(() => import("./pages/AdminNovedades"));
const AdminSoftDeleteRecovery = lazy(() => import("./pages/AdminSoftDeleteRecovery").then(m => ({ default: m.AdminSoftDeleteRecovery })));
const AdminLogs = lazy(() => import("./pages/admin/LogsPage").then(m => ({ default: m.LogsPage })));
const ProgramaTiposDocumento = lazy(() =>
  import("./pages/admin/ProgramaTiposDocumentoPage").then((m) => ({
    default: m.ProgramaTiposDocumentoPage,
  }))
);

// Familias (heavy module)
const FamiliaRegistro = lazy(() => import("./pages/FamiliaRegistro"));
const FamiliaDetalle = lazy(() => import("./pages/FamiliaDetalle"));
const FamiliasVerificar = lazy(() => import("./pages/FamiliasVerificar"));
const FamiliasEntregas = lazy(() => import("./pages/FamiliasEntregas"));

// Misc
const Perfil = lazy(() => import("./pages/Perfil"));
const MiQR = lazy(() => import("./pages/MiQR"));
const Novedades = lazy(() => import("./pages/Novedades"));
const NovedadDetalle = lazy(() => import("./pages/NovedadDetalle"));

// ─── Shared loading fallback ─────────────────────────────────────────────────
const PageLoader = () => (
  <div className="flex items-center justify-center h-full min-h-[60vh]">
    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
  </div>
);

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
    <Suspense fallback={<PageLoader />}>
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
            <Dashboard />
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
        <Route path="/admin/programas/:slug/tipos-documento">
          <ProtectedRoute requiredRoles={["superadmin"]}>
            <ProgramaTiposDocumento />
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
        <Route path="/admin/soft-delete-recovery">
          <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
            <AdminSoftDeleteRecovery />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/logs">
          <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
            <AdminLogs />
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
            <Redirect to="/programas/programa_familias?tab=familias" />
          </ProtectedRoute>
        </Route>
        <Route path="/familias/verificar">
          <ProtectedRoute requiredRoles={["admin", "superadmin", "voluntario"]}>
            <FamiliasVerificar />
          </ProtectedRoute>
        </Route>
        <Route path="/familias/entregas">
          <ProtectedRoute requiredRoles={["admin", "superadmin", "voluntario"]}>
            <FamiliasEntregas />
          </ProtectedRoute>
        </Route>
        <Route path="/familias/informes-sociales">
          <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
            <Redirect to="/programas/programa_familias?tab=reports" />
          </ProtectedRoute>
        </Route>
        <Route path="/familias/:id">
          <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
            <FamiliaDetalle />
          </ProtectedRoute>
        </Route>
        <Route path="/familias">
          <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
            <Redirect to="/programas/programa_familias?tab=familias" />
          </ProtectedRoute>
        </Route>

        {/* Perfil + Mi QR */}
        <Route path="/perfil">
          <ProtectedRoute>
            <Perfil />
          </ProtectedRoute>
        </Route>
        <Route path="/mi-qr">
          <ProtectedRoute>
            <MiQR />
          </ProtectedRoute>
        </Route>

        {/* Novedades */}
        <Route path="/novedades/:id">
          <ProtectedRoute>
            <NovedadDetalle />
          </ProtectedRoute>
        </Route>
        <Route path="/novedades">
          <ProtectedRoute>
            <Novedades />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/novedades">
          <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
            <AdminNovedades />
          </ProtectedRoute>
        </Route>

        {/* Fallback */}
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
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
