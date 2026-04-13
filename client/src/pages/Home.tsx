import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAppStore } from "@/store/useAppStore";
import type { BocatasRole } from "@/components/layout/ProtectedRoute";
import {
  UserPlus,
  QrCode,
  Search,
  BarChart3,
  MapPin,
  Users,
  ArrowRight,
  Calendar,
  Bell,
  User,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Tile {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  primary?: boolean;
  roles?: BocatasRole[];
}

const TILES: Tile[] = [
  // ── Beneficiario tiles ──
  {
    label: "Mi perfil",
    description: "Ver y actualizar mis datos personales",
    href: "/perfil",
    icon: User,
    primary: true,
    roles: ["beneficiario"],
  },
  {
    label: "Mi código QR",
    description: "Ver mi QR para el check-in en el comedor",
    href: "/mi-qr",
    icon: QrCode,
    roles: ["beneficiario"],
  },
  {
    label: "Novedades",
    description: "Avisos y noticias de la asociación",
    href: "/novedades",
    icon: Bell,
    roles: ["beneficiario"],
  },
  // ── Voluntario + admin tiles ──
  {
    label: "Check-in comedor",
    description: "Registrar asistencia al comedor hoy",
    href: "/checkin",
    icon: QrCode,
    primary: true,
    roles: ["voluntario", "admin", "superadmin"],
  },
  {
    label: "Registrar persona",
    description: "Alta de nueva persona en el sistema",
    href: "/personas/nueva",
    icon: UserPlus,
    roles: ["voluntario", "admin", "superadmin"],
  },
  {
    label: "Consultar ficha",
    description: "Buscar y ver ficha de persona",
    href: "/personas",
    icon: Search,
    roles: ["voluntario", "admin", "superadmin"],
  },
  {
    label: "Programas",
    description: "Ver programas activos y participantes",
    href: "/programas",
    icon: BookOpen,
    roles: ["voluntario", "admin", "superadmin"],
  },
  // ── Admin tiles ──
  {
    label: "Dashboard",
    description: "Estadísticas y métricas del comedor",
    href: "/dashboard",
    icon: BarChart3,
    roles: ["admin", "superadmin"],
  },
  {
    label: "Programa de Familias",
    description: "Gestión de unidades familiares y entregas",
    href: "/familias",
    icon: Users,
    roles: ["admin", "superadmin"],
  },
];

function canSee(tile: Tile, role: BocatasRole): boolean {
  if (!tile.roles) return true;
  return (tile.roles as string[]).includes(role);
}

export default function Home() {
  const { user } = useAuth();
  const { selectedLocation } = useAppStore();
  const role = ((user?.role as BocatasRole | undefined) ?? "voluntario");
  const visibleTiles = TILES.filter((t) => canSee(t, role));
  const primaryTile = visibleTiles.find((t) => t.primary);
  const secondaryTiles = visibleTiles.filter((t) => !t.primary);

  const currentDate = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const firstName = user?.name?.split(" ")[0] ?? "voluntario/a";

  return (
    <div className="p-5 md:p-8 max-w-3xl mx-auto">

      {/* ── Greeting ─────────────────────────────────────────────────── */}
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground leading-tight">
          Hola, {firstName}
        </h1>
        <p className="text-lg text-muted-foreground font-medium mt-1 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[#C41230]" aria-hidden="true" />
          <span className="capitalize">{currentDate}</span>
        </p>

        {/* Location badge */}
        <div className="mt-4">
          {selectedLocation ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#C41230] bg-[#C41230]/8 border border-[#C41230]/20 rounded-full px-3 py-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {selectedLocation.nombre}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground bg-muted border border-border rounded-full px-3 py-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              Selecciona una sede en el menú lateral
            </span>
          )}
        </div>
      </header>

      {/* ── Primary CTA ──────────────────────────────────────────────── */}
      {primaryTile && (
        <Link href={primaryTile.href}>
          <div
            className="relative overflow-hidden rounded-2xl border-2 border-[#C41230] bg-white shadow-[0_4px_20px_-4px_rgba(196,18,48,0.15)] hover:shadow-[0_8px_30px_-4px_rgba(196,18,48,0.25)] transition-all duration-200 cursor-pointer mb-5 group"
            role="button"
            tabIndex={0}
            aria-label={primaryTile.label}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") window.location.href = primaryTile.href; }}
          >
            {/* Decorative background shape */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#C41230] opacity-5 rounded-bl-[100px] pointer-events-none" />
            <div className="p-6 flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-[#FDE8E8] text-[#C41230] flex items-center justify-center shrink-0 group-hover:bg-[#C41230] group-hover:text-white transition-colors duration-200">
                <primaryTile.icon className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground">{primaryTile.label}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{primaryTile.description}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-[#C41230] shrink-0 group-hover:translate-x-1 transition-transform duration-200" />
            </div>
          </div>
        </Link>
      )}

      {/* ── Secondary tiles grid ─────────────────────────────────────── */}
      {secondaryTiles.length > 0 && (
        <>
          <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Acciones rápidas
          </h2>
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {secondaryTiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <Link key={tile.href} href={tile.href}>
                  <div
                    className={cn(
                      "flex flex-col gap-3 p-5 rounded-2xl border border-border bg-white",
                      "shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.1)]",
                      "cursor-pointer transition-all duration-200 group hover:border-[#C41230]/30 hover:-translate-y-0.5"
                    )}
                    role="button"
                    tabIndex={0}
                    aria-label={tile.label}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") window.location.href = tile.href; }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#FAFAF8] border border-border text-[#5E5E5E] flex items-center justify-center group-hover:bg-[#C41230]/10 group-hover:text-[#C41230] group-hover:border-[#C41230]/20 transition-colors duration-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground leading-tight">{tile.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{tile.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* ── Footer role badge ─────────────────────────────────────────── */}
      <div className="mt-10 text-center">
        <span className="text-xs text-muted-foreground">
          Rol activo:{" "}
          <strong className="text-[#C41230] capitalize">{role}</strong>
        </span>
      </div>
    </div>
  );
}
