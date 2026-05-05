/**
 * MiQR.tsx — beneficiary's own QR page (Phase 6 QA-1B stub).
 *
 * Pre-QA-1B this page generated a QR from `user.openId` (Manus OAuth ID).
 * The check-in scanner expects a Supabase `persons.id` UUID and extracts
 * via regex `[0-9a-f]{8}-[0-9a-f]{4}-...`. Manus openId is not UUID-shaped,
 * so the generated QR was never scannable. This was a latent functional
 * bug (F-002 in the Phase 6 audit, paired with the F-001 PII leak).
 *
 * The proper fix requires linking the Manus auth user to a Supabase
 * `persons` row (a `persons.auth_open_id` column + backfill, or a session-
 * level join table). That's a schema + data-migration change that needs:
 *   - legal review (which Manus user identifies which person row?)
 *   - Schema-Agent ownership per CLAUDE.md §2 swim lanes
 *   - Stakeholder confirmation that beneficiaries actually use this page
 *     today (in Gate 1 the operator-driven flow is dominant)
 *
 * Until that lands, render a friendly "no disponible aún" message instead
 * of a broken QR. This stops the production bug (PII-leaking + non-
 * scannable QR) without shipping unverified architecture.
 *
 * Tracking: see docs/superpowers/findings/2026-05-06-consolidated.md F-002.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QrCode, Info } from "lucide-react";
import { Link } from "wouter";

export default function MiQR() {
  const { user } = useAuth();

  return (
    <div className="p-5 md:p-8 max-w-md mx-auto">
      <header className="mb-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#C41230] text-white flex items-center justify-center mx-auto mb-4">
          <QrCode className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Mi código QR</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {user?.name ? `Hola, ${user.name}.` : "Tu código personal."}
        </p>
      </header>

      <Card className="mb-4 border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-amber-700" aria-hidden="true" />
            <span>Aún no disponible</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-amber-900">
          <p>
            Estamos preparando tu código QR personal. Mientras tanto, si vienes
            al comedor un voluntario te registrará con tu nombre — el servicio
            funciona igual.
          </p>
          <p className="text-xs text-amber-800">
            Cuando esté listo, tu QR aparecerá aquí y podrás guardarlo en el
            móvil para usarlo sin conexión.
          </p>
        </CardContent>
      </Card>

      <div className="text-center">
        <Link href="/inicio">
          <Button variant="outline">Volver al inicio</Button>
        </Link>
      </div>
    </div>
  );
}
