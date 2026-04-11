import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAppStore } from "@/store/useAppStore";
import type { BocatasRole } from "@/components/layout/ProtectedRoute";
import { UserPlus, QrCode, Search, BarChart3, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tile {
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  color: string;
  roles?: BocatasRole[];
}

const TILES: Tile[] = [
  {
    label: "Registrar persona",
    description: "Alta de nueva persona en el sistema",
    href: "/personas/nueva",
    icon: <UserPlus className="h-8 w-8" />,
    color: "bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-700",
  },
  {
    label: "Check-in comedor",
    description: "Registrar asistencia al comedor",
    href: "/checkin",
    icon: <QrCode className="h-8 w-8" />,
    color: "bg-green-50 border-green-200 hover:bg-green-100 text-green-700",
  },
  {
    label: "Consultar ficha",
    description: "Buscar y ver ficha de persona",
    href: "/personas",
    icon: <Search className="h-8 w-8" />,
    color: "bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-700",
  },
  {
    label: "Dashboard",
    description: "Estadísticas y métricas del comedor",
    href: "/dashboard",
    icon: <BarChart3 className="h-8 w-8" />,
    color: "bg-purple-50 border-purple-200 hover:bg-purple-100 text-purple-700",
    roles: ["admin", "superadmin"],
  },
];

function canSee(tile: Tile, role: BocatasRole): boolean {
  if (!tile.roles) return true;
  return tile.roles.includes(role);
}

export default function Home() {
  const { user } = useAuth();
  const { selectedLocation } = useAppStore();
  const role = ((user?.role as BocatasRole | undefined) ?? "voluntario");
  const visibleTiles = TILES.filter((t) => canSee(t, role));

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Hola, {user?.name?.split(" ")[0] ?? "voluntario/a"} 👋
        </h1>
        <p className="text-gray-500 mt-1">¿Qué necesitas hacer hoy?</p>
        {selectedLocation ? (
          <div className="mt-3 inline-flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{selectedLocation.nombre}</span>
          </div>
        ) : (
          <div className="mt-3 inline-flex items-center gap-1.5 text-sm text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-3 py-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Selecciona una sede en el menú lateral</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {visibleTiles.map((tile) => (
          <Link key={tile.href} href={tile.href}>
            <div
              className={cn(
                "min-h-[120px] flex flex-col items-center justify-center gap-3 p-5 rounded-xl border-2 cursor-pointer transition-all duration-150 select-none",
                tile.color
              )}
              role="button"
              tabIndex={0}
              aria-label={tile.label}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  window.location.href = tile.href;
                }
              }}
            >
              {tile.icon}
              <div className="text-center">
                <div className="font-semibold text-sm leading-tight">{tile.label}</div>
                <div className="text-xs opacity-70 mt-0.5 leading-tight">{tile.description}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-8 text-center">
        <span className="text-xs text-gray-400 capitalize">
          Rol activo: <strong>{role}</strong>
        </span>
      </div>
    </div>
  );
}
