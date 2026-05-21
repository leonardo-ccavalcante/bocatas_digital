import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** Derives the logical parent route for a given path. Returns null at root. */
export function resolveParent(route: string): string | null {
  if (!route || route === "/") return null;

  // /programas/programa_familias/familia/<id>/miembro/<m>
  //   → /programas/programa_familias/familia/<id>
  // /programas/programa_familias/familia/<id>
  //   → /programas/programa_familias
  if (route.startsWith("/programas/programa_familias/familia/")) {
    const segs = route.split("/");
    // segs = ["", "programas", "programa_familias", "familia", "<id>", "miembro", "<m>"]
    if (segs.length >= 7) return segs.slice(0, 5).join("/"); // → .../familia/<id>
    if (segs.length >= 5) return "/programas/programa_familias";
  }

  // /personas/<id> or /personas/nueva → /personas
  if (/^\/personas\/.+/.test(route)) return "/personas";

  // /programas/<slug> → /programas
  if (/^\/programas\/.+/.test(route)) return "/programas";

  // /admin/<section> → /admin's first page; fall back to home
  if (/^\/admin\/.+/.test(route)) return "/";

  // Default: go home
  return "/";
}

interface BackLinkProps {
  /** Override label. Defaults to "Volver". */
  label?: string;
  /** Override the computed parent href. */
  href?: string;
  className?: string;
}

/**
 * BackLink — renders "← Volver" when on a detail route and navigates to the
 * logical parent page. Returns null at root-level routes that have no parent.
 *
 * Usage: drop into any detail-page header area. The component auto-detects the
 * current route and resolves the parent; pass `href` to override.
 */
export default function BackLink({ label = "Volver", href, className }: BackLinkProps) {
  const [location, navigate] = useLocation();
  const target = href ?? resolveParent(location);

  if (!target) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(target)}
      aria-label={`Volver${label !== "Volver" ? `: ${label}` : ""}`}
      className={cn(
        "inline-flex items-center gap-1.5 h-9 px-2 -ml-2 rounded",
        "text-xs font-medium text-muted-foreground hover:text-foreground",
        "transition-colors",
        className
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
