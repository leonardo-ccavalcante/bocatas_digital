/**
 * Información social. Cinco campos que el servidor aceptaba desde el principio
 * y que ninguna pantalla dejaba corregir: NotasTab los pinta en SÓLO LECTURA.
 *
 * `recorrido_migratorio` está en HIGH_RISK_FIELDS y `notas_privadas` en los
 * campos restringidos, así que van tras `isAdmin` igual que `situacion_legal`.
 */
import { Seccion, AreaTexto, Texto, type SeccionProps } from "./_controls";

export function SeccionSocial({ values, onChange, isAdmin }: SeccionProps) {
  return (
    <Seccion titulo="Información social" id="edit-seccion-social">
      <AreaTexto
        id="edit-necesidades_principales"
        label="Necesidades principales"
        maxLength={2000}
        value={values.necesidades_principales}
        onChange={(v) => onChange("necesidades_principales", v)}
      />
      {/* Es lo que lee el comedor antes de servir: se queda destacado. */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-950/30">
        <Texto
          id="edit-restricciones_alimentarias"
          label="Restricciones alimentarias"
          maxLength={500}
          value={values.restricciones_alimentarias}
          onChange={(v) => onChange("restricciones_alimentarias", v)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Alergias e intolerancias. Se muestra en el check-in.
        </p>
      </div>
      <AreaTexto
        id="edit-observaciones"
        label="Observaciones"
        maxLength={2000}
        value={values.observaciones}
        onChange={(v) => onChange("observaciones", v)}
      />
      {isAdmin && (
        <>
          <AreaTexto
            id="edit-recorrido_migratorio"
            label="Recorrido migratorio"
            maxLength={2000}
            value={values.recorrido_migratorio}
            onChange={(v) => onChange("recorrido_migratorio", v)}
          />
          <AreaTexto
            id="edit-notas_privadas"
            label="Notas privadas"
            maxLength={2000}
            ayuda="Sólo las ve el personal de administración."
            value={values.notas_privadas}
            onChange={(v) => onChange("notas_privadas", v)}
          />
        </>
      )}
    </Seccion>
  );
}
