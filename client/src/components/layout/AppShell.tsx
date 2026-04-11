import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAppStore } from "@/store/useAppStore";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import type { BocatasRole } from "./ProtectedRoute";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Home,
  Users,
  QrCode,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

type LocationRow = Database["public"]["Tables"]["locations"]["Row"];

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: BocatasRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", href: "/", icon: <Home className="h-5 w-5" /> },
  { label: "Personas", href: "/personas", icon: <Users className="h-5 w-5" /> },
  { label: "Check-in", href: "/checkin", icon: <QrCode className="h-5 w-5" /> },
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
  const { selectedLocation, setSelectedLocation, sidebarCollapsed, setSidebarCollapsed } = useAppStore();
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase
      .from("locations")
      .select("*")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => {
        if (data) setLocations(data);
      });
  }, [supabase]);

  // Role comes from Manus user metadata; default to voluntario
  const role = ((user?.role as BocatasRole | undefined) ?? "voluntario");
  const visibleNav = NAV_ITEMS.filter((item) => canAccess(item, role));

  const handleSignOut = async () => {
    await logout();
    window.location.href = "/login";
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col bg-amber-900 text-amber-50 transition-all duration-200 shrink-0",
          sidebarCollapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo + toggle */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-amber-800">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <span className="text-2xl" role="img" aria-label="Pan bocata">🥖</span>
              <span className="font-bold text-sm leading-tight">Bocatas<br />Digital</span>
            </div>
          )}
          {sidebarCollapsed && <span className="text-2xl mx-auto" role="img" aria-label="Pan bocata">🥖</span>}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1 rounded hover:bg-amber-800 transition-colors ml-auto"
            aria-label={sidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            {sidebarCollapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </button>
        </div>

        {/* Location selector */}
        {!sidebarCollapsed && (
          <div className="px-3 py-3 border-b border-amber-800">
            <div className="flex items-center gap-1 mb-1">
              <MapPin className="h-3 w-3 text-amber-300" aria-hidden="true" />
              <span className="text-xs text-amber-300 font-medium">Sede</span>
            </div>
            <Select
              value={selectedLocation?.id ?? ""}
              onValueChange={(id) => {
                const loc = locations.find((l) => l.id === id);
                if (loc) setSelectedLocation({ id: loc.id, nombre: loc.nombre, tipo: loc.tipo });
              }}
            >
              <SelectTrigger
                className="h-8 text-xs bg-amber-800 border-amber-700 text-amber-50 focus:ring-amber-600"
                aria-label="Seleccionar sede"
              >
                <SelectValue placeholder="Seleccionar sede…" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-3 space-y-1 px-2 overflow-y-auto" aria-label="Navegación principal">
          {visibleNav.map((item) => {
            const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm font-medium",
                    active
                      ? "bg-amber-700 text-white"
                      : "text-amber-200 hover:bg-amber-800 hover:text-white",
                    sidebarCollapsed && "justify-center px-2"
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  {item.icon}
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User + Sign out */}
        <div className="border-t border-amber-800 p-3 space-y-2">
          {!sidebarCollapsed && user && (
            <div className="text-xs text-amber-300 truncate px-1">
              <div className="font-medium text-amber-100 truncate">{user.name ?? user.email}</div>
              <div className="capitalize">{role}</div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className={cn(
              "w-full text-amber-200 hover:bg-amber-800 hover:text-white",
              sidebarCollapsed ? "px-2 justify-center" : "justify-start gap-2"
            )}
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!sidebarCollapsed && <span>Salir</span>}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
