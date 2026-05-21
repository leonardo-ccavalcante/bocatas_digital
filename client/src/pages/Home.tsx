import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import UrgentAnnouncementBanner from "@/components/UrgentAnnouncementBanner";
import { useAppStore } from "@/store/useAppStore";
import type { BocatasRole } from "@/components/layout/ProtectedRoute";
import {
  UserPlus,
  QrCode,
  Search,
  BarChart3,
  MapPin,
  Users,
  BookOpen,
  Bell,
  User,
  ArrowRight,
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

// NOTE: /familias now redirects to /programas/programa_familias?tab=familias (see App.tsx).
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
    label: "Check-in",
    description: "Registrar asistencia hoy",
    href: "/checkin",
    icon: QrCode,
    primary: true,
    roles: ["voluntario", "admin", "superadmin"],
  },
  {
    label: "Nueva persona",
    description: "Alta rápida en el sistema",
    href: "/personas/nueva",
    icon: UserPlus,
    roles: ["voluntario", "admin", "superadmin"],
  },
  {
    label: "Consultar ficha",
    description: "Buscar y ver fichas",
    href: "/personas",
    icon: Search,
    roles: ["voluntario", "admin", "superadmin"],
  },
  {
    label: "Programas",
    description: "Programas y participantes",
    href: "/programas",
    icon: BookOpen,
    roles: ["voluntario", "admin", "superadmin"],
  },
  // ── Admin tiles ──
  {
    label: "Dashboard",
    description: "Métricas del comedor",
    href: "/dashboard",
    icon: BarChart3,
    roles: ["admin", "superadmin"],
  },
  {
    label: "Familias",
    description: "Unidades familiares y entregas",
    href: "/programas/programa_familias?tab=familias",
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

  const VALID_BOCATAS_ROLES: BocatasRole[] = ["superadmin", "admin", "voluntario", "beneficiario"];
  const rawRole = user?.role as string | undefined;
  const role: BocatasRole = (rawRole && VALID_BOCATAS_ROLES.includes(rawRole as BocatasRole))
    ? (rawRole as BocatasRole)
    : "beneficiario";

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
    <div className="p-5 md:p-10 max-w-5xl mx-auto">

      <UrgentAnnouncementBanner />

      {/* ── Editorial header ──────────────────────────────────────────── */}
      <header className="mb-8">
        <p className="text-[10px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2 capitalize">
          {currentDate}
        </p>
        <h1 className="text-display-1 text-foreground">
          Hola, {firstName}
        </h1>
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          {selectedLocation && (
            <span className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-primary bg-primary/5 border border-primary/20 rounded-full px-2.5 py-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {selectedLocation.nombre}
            </span>
          )}
          {selectedLocation && (
            <span className="text-body-sm text-muted-foreground">·</span>
          )}
          <span className="text-body-sm text-muted-foreground capitalize">{role}</span>
        </div>
      </header>

      {/* ── Primary CTA ──────────────────────────────────────────────── */}
      {primaryTile && (
        <Link
          href={primaryTile.href}
          aria-label={primaryTile.label}
          className="block w-full mb-8 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"
        >
          <div className="relative overflow-hidden rounded-2xl bg-background border border-primary/40 shadow-[0_4px_20px_-4px_rgba(196,18,48,0.10)] hover:shadow-[0_8px_28px_-4px_rgba(196,18,48,0.18)] transition-shadow duration-200">
            {/* Decorative accent shape */}
            <div
              className="absolute top-0 right-0 w-32 h-32 bg-primary opacity-5 rounded-bl-[100px] pointer-events-none"
              aria-hidden="true"
            />
            <div className="px-6 pt-5 pb-5 flex items-center gap-5">
              <span className="text-eyebrow text-muted-foreground shrink-0">
                N°&nbsp;00
              </span>
              <div className="flex-1">
                <h2 className="text-h2 text-foreground">{primaryTile.label}</h2>
                <p className="text-body text-muted-foreground mt-1">{primaryTile.description}</p>
              </div>
              <primaryTile.icon
                className="h-6 w-6 text-primary shrink-0"
                aria-hidden="true"
              />
              <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-primary transition-all duration-200 group-hover:gap-2 ml-1">
                Abrir
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
          </div>
        </Link>
      )}

      {/* ── Section rule ──────────────────────────────────────────────── */}
      {secondaryTiles.length > 0 && (
        <div className="flex items-end justify-between mb-5 gap-3" aria-hidden="true">
          <p className="text-eyebrow text-foreground">
            <span className="text-primary">●</span>&nbsp;&nbsp;Acciones rápidas
          </p>
          <div className="flex-1 h-px mx-3 sm:mx-5 bg-border" />
          <p className="text-eyebrow text-muted-foreground tabular-stat">
            {String(secondaryTiles.length).padStart(2, "0")}
          </p>
        </div>
      )}

      {/* ── Quick-action tile grid ─────────────────────────────────────── */}
      {secondaryTiles.length > 0 && (
        <nav aria-label="Acciones rápidas">
          <ul
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 list-none p-0 m-0"
            role="list"
          >
            {secondaryTiles.map((tile, i) => {
              const Icon = tile.icon;
              return (
                <li key={tile.href}>
                  <Link
                    href={tile.href}
                    aria-label={tile.label}
                    className={cn(
                      "group flex flex-col h-full rounded-2xl bg-card border border-border",
                      "overflow-hidden transition-all duration-300",
                      "hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(0,0,0,0.14)]",
                      "active:scale-[0.99]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    )}
                  >
                    {/* Card header */}
                    <div className="px-6 pt-5 flex items-start justify-between gap-3">
                      <span className="text-eyebrow text-muted-foreground tabular-stat">
                        N°&nbsp;{String(i + 1).padStart(2, "0")}
                      </span>
                      <Icon
                        className="h-5 w-5 text-primary shrink-0"
                        aria-hidden="true"
                      />
                    </div>

                    {/* Card body */}
                    <div className="px-6 pt-4 pb-5 flex-1">
                      <h3
                        lang="es"
                        className="text-[19px] sm:text-[21px] font-semibold leading-[1.2] tracking-[-0.01em] text-foreground"
                        style={{ textWrap: "balance" } as React.CSSProperties}
                      >
                        {tile.label}
                      </h3>
                      <p className="text-body-sm text-muted-foreground mt-2 leading-snug line-clamp-2">
                        {tile.description}
                      </p>
                    </div>

                    {/* Card footer */}
                    <div className="mt-auto px-6 py-3 flex items-center justify-end border-t border-border bg-background/80">
                      <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-foreground transition-all duration-300 group-hover:gap-2 group-hover:text-primary">
                        Abrir
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
