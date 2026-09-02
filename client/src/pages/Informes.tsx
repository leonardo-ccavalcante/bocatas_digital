/**
 * Informes.tsx — la casa de los informes (barra lateral › «Informes»).
 *
 * NO construye nada nuevo: monta el módulo que YA existe,
 * `@/features/reports-tab` (Plantillas | Constructor | Guardadas, con las 10
 * plantillas del TemplatesGrid), pasándole el autor y NINGÚN `programaId`:
 * aquí no se mira un programa, se mira la entidad entera. El mismo componente
 * sigue montado como pestaña «Reports» del programa de familias
 * (ProgramTabs.tsx:148) — esta página no toca ese montaje ni ENABLED_TABS
 * (el aviso de reports-tab/index.tsx:8).
 *
 * Y añade lo que no cabe en ninguna plantilla: la comprobación en bloque del
 * consentimiento de imagen («tengo 7 nombres para un cartel»).
 *
 * PARA AÑADIR UN INFORME NUEVO NO SE TOCA ESTE FICHERO. El informe se añade
 * al TemplatesGrid existente siguiendo la receta de
 * `server/routers/reports/CODEMAP.md` §«Recipe: adding an 11th templated
 * report»: copiar `_TEMPLATE.ts.skeleton`, aplicar `withSoftDeleteFilter`,
 * envolver el error con `wrapDbError`, no seleccionar PII de alto riesgo,
 * mergeRouters en `server/routers/reports/index.ts`, test de contrato en
 * `server/__tests__/reports/templated-shape.test.ts` y actualizar el CODEMAP;
 * en el cliente, una tarjeta en `features/reports-tab/TemplatesGrid.tsx` +
 * su modal en `features/reports-tab/templates/`. Esta página los hereda sin
 * cambio alguno.
 *
 * Acceso: admin y superadmin. TODOS los procedimientos de
 * `server/routers/reports/` son adminProcedure (CODEMAP.md §Compliance:
 * «ALL procedures use adminProcedure. Voluntarios receive FORBIDDEN»), igual
 * que persons.checkConsentByNames. Abrirla a voluntarios sería enseñarles
 * tarjetas que devuelven FORBIDDEN una a una.
 *
 * El <h2>Informes</h2> que pinta el propio ReportsTab se queda como está: el
 * componente es compartido con la pestaña del programa de familias y no se
 * retoca por estética.
 */
import { FileBarChart } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import ReportsTab from "@/features/reports-tab";
import { ComprobarConsentimientoDialog } from "@/features/persons/components/ComprobarConsentimientoDialog";

export default function Informes() {
  const { user } = useAuth();
  // Mismo puente que ProgramTabs.tsx:59-60 — SavedQueriesList necesita el autor.
  const currentUserId = String(user?.id ?? "");

  return (
    <div className="min-h-full bg-background">
      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 min-w-0">
          <FileBarChart className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
          <h1 className="text-h2 truncate text-foreground">Informes</h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-5 space-y-6">
        {/* ── Comprobaciones ─────────────────────────────────────────────── */}
        <section aria-labelledby="informes-comprobaciones" className="space-y-2">
          <h2
            id="informes-comprobaciones"
            className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Comprobaciones
          </h2>
          <p className="text-xs text-muted-foreground">
            Pega una lista de nombres y te decimos de quién se puede publicar la
            foto y de quién no.
          </p>
          <ComprobarConsentimientoDialog />
        </section>

        {/* Módulo existente, sin programaId: Plantillas | Constructor | Guardadas */}
        <ReportsTab currentUserId={currentUserId} />
      </div>
    </div>
  );
}
