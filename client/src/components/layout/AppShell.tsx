import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAppStore } from "@/store/useAppStore";
import type { BocatasRole } from "./ProtectedRoute";
import {
  Home,
  Users,
  QrCode,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  BookOpen,
  UserCog,
  ChevronLeft,
  ChevronRight,
  Bell,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: BocatasRole[];
}

const NAV_ITEMS: NavItem[] = [
  // ── All roles ──
  { label: "Inicio", href: "/", icon: <Home className="h-5 w-5" /> },
  { label: "Novedades", href: "/novedades", icon: <Bell className="h-5 w-5" /> },
  // ── Beneficiario only ──
  {
    label: "Mi perfil",
    href: "/perfil",
    icon: <User className="h-5 w-5" />,
    roles: ["beneficiario"],
  },
  {
    label: "Mi QR",
    href: "/mi-qr",
    icon: <QrCode className="h-5 w-5" />,
    roles: ["beneficiario"],
  },
  // ── Voluntario + admin ──
  {
    label: "Check-in",
    href: "/checkin",
    icon: <QrCode className="h-5 w-5" />,
    roles: ["voluntario", "admin", "superadmin"],
  },
  {
    label: "Personas",
    href: "/personas",
    icon: <Users className="h-5 w-5" />,
    roles: ["voluntario", "admin", "superadmin"],
  },
  {
    label: "Programas",
    href: "/programas",
    icon: <BookOpen className="h-5 w-5" />,
    roles: ["voluntario", "admin", "superadmin"],
  },
  // ── Admin+ ──
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <BarChart3 className="h-5 w-5" />,
    roles: ["admin", "superadmin"],
  },
  {
    label: "Admin",
    href: "/admin/consentimientos",
    icon: <Settings className="h-5 w-5" />,
    roles: ["superadmin"],
  },
  {
    label: "Usuarios",
    href: "/admin/usuarios",
    icon: <UserCog className="h-5 w-5" />,
    roles: ["superadmin"],
  },
];

function canAccess(item: NavItem, role: BocatasRole): boolean {
  if (!item.roles) return true;
  return item.roles.includes(role);
}

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { sidebarCollapsed, setSidebarCollapsed } = useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const role = ((user?.role as BocatasRole | undefined) ?? "voluntario");
  const visibleNav = NAV_ITEMS.filter((item) => canAccess(item, role));

  const handleSignOut = async () => {
    await logout();
    window.location.href = "/login";
  };

  // User initials for avatar
  const initials = user?.name
    ? user.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
    : "U";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Desktop Sidebar ─────────────────────────────────────────── */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 transition-all duration-200",
          "bg-[#8B0E22] text-white",
          sidebarCollapsed ? "w-16" : "w-60"
        )}
        style={{ boxShadow: "4px 0 20px -4px rgba(139,14,34,0.25)" }}
      >
        {/* Logo + collapse toggle */}
        <div
          className={cn(
            "flex items-center border-b border-white/10 py-4",
            sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"
          )}
        >
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5">
              {/* Bocatas logo circle */}
              <div className="w-9 h-9 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center shrink-0">
                <span className="text-lg leading-none" role="img" aria-label="Bocatas">🥖</span>
              </div>
              <div className="leading-tight">
                <p className="font-bold text-sm text-white">Bocatas</p>
                <p className="text-[10px] text-white/60 font-medium">Digital</p>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="w-9 h-9 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center">
              <span className="text-lg leading-none" role="img" aria-label="Bocatas">🥖</span>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn(
              "p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white",
              sidebarCollapsed ? "mt-0" : ""
            )}
            aria-label={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {sidebarCollapsed
              ? <ChevronRight className="h-4 w-4" />
              : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Sede selector moved to check-in page */}

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto" aria-label="Navegación principal">
          {visibleNav.map((item) => {
            const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-xl cursor-pointer transition-all text-sm font-medium",
                    sidebarCollapsed ? "justify-center px-2 py-3" : "px-3 py-2.5",
                    active
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  <span className={cn("shrink-0", active && "drop-shadow-sm")}>
                    {item.icon}
                  </span>
                  {!sidebarCollapsed && <span>{item.label}</span>}
                  {!sidebarCollapsed && active && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80" />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User + Sign out */}
        <div className="border-t border-white/10 p-3 space-y-2">
          {!sidebarCollapsed && user && (
            <div className="flex items-center gap-2.5 px-1 py-1">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs shrink-0">
                {initials}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-white truncate">{user.name ?? user.email}</p>
                <p className="text-[10px] text-white/50 capitalize">{role}</p>
              </div>
            </div>
          )}
          {sidebarCollapsed && user && (
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs">
                {initials}
              </div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className={cn(
              "w-full flex items-center rounded-xl py-2 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors",
              sidebarCollapsed ? "justify-center px-2" : "gap-2 px-3"
            )}
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!sidebarCollapsed && <span>Salir</span>}
          </button>
        </div>
      </aside>

      {/* ── Mobile Header ────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="md:hidden sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-white border-b border-black/5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full border-2 border-[#C41230] bg-[#C41230]/10 flex items-center justify-center shrink-0">
              <span className="text-base" role="img" aria-label="Bocatas">🥖</span>
            </div>
            <span className="font-bold text-base text-[#C41230]">Bocatas Digital</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 -mr-1 text-[#5E5E5E] rounded-xl hover:bg-black/5 transition-colors"
            aria-label="Abrir menú"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </header>

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Mobile slide-over panel */}
        <div
          className={cn(
            "fixed top-0 right-0 z-50 w-4/5 max-w-sm h-full bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out md:hidden",
            mobileMenuOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex items-center justify-between p-4 border-b border-black/5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full border-2 border-[#C41230] bg-[#C41230]/10 flex items-center justify-center">
                <span className="text-base" role="img" aria-label="Bocatas">🥖</span>
              </div>
              <span className="font-bold text-base text-[#C41230]">Bocatas Digital</span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 text-[#5E5E5E] rounded-xl hover:bg-black/5"
              aria-label="Cerrar menú"
            >
              <X size={24} />
            </button>
          </div>

          {/* Mobile sede selector moved to check-in page */}

          <nav className="flex-1 overflow-y-auto py-3 px-3 flex flex-col gap-1">
            {visibleNav.map((item) => {
              const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer",
                      active
                        ? "bg-[#C41230]/10 text-[#C41230]"
                        : "text-[#1A1A1A] hover:bg-black/5"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className={cn("shrink-0", active ? "text-[#C41230]" : "text-[#5E5E5E]")}>
                      {item.icon}
                    </span>
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-black/5">
            {user && (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#C41230]/15 flex items-center justify-center text-[#C41230] font-bold text-sm shrink-0">
                  {initials}
                </div>
                <div>
                  <p className="font-semibold text-sm text-[#1A1A1A]">{user.name ?? user.email}</p>
                  <p className="text-xs text-[#5E5E5E] capitalize">{role}</p>
                </div>
              </div>
            )}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-[#5E5E5E] hover:bg-black/5 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              Cerrar sesión
            </button>
          </div>
        </div>

        {/* ── Main content ──────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
