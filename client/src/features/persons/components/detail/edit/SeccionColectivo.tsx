/**
 * Datos de colectivo — categoría especial (RGPD Art. 9/10).
 *
 * Dos decisiones que no son de estilo:
 *
 * 1. Los valores se VEN siempre, pero desactivados. Leerlos ya está permitido
 *    para quien puede abrir esta ficha (redactHighRiskFields deja pasar a
 *    admin/superadmin); escribirlos es una decisión aparte. Un candado que
 *    además oculta obligaría a abrirlo sólo para mirar.
 *
 * 2. La casilla de consentimiento aparece SÓLO al abrir el candado, no antes.
 *    Ponerla al lado de unos controles desactivados invita a marcarla por
 *    reflejo; ponerla en el instante exacto en que los campos se vuelven
 *    escribibles la convierte en la puerta que pretende ser.
 *
 * Se reafirma en cada apertura del modal porque no hay nada que leer: el flag
 * `colectivo_consentimiento` es transitorio y nunca se persiste, y la tabla
 * `consents` cubre otros fines distintos. El cliente no tiene forma honesta de
 * saltarse la pregunta.
 *
 * El servidor sigue siendo la frontera: update.ts rechaza el parche si llegan
 * estos campos sin el flag. Esto es fallar rápido, no la autorización.
 */
import { COLECTIVO_LABELS, type PersonCreate } from "../../../schemas";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { GrupoCasillas, Texto, type SeccionProps } from "./_controls";

interface SeccionColectivoProps extends SeccionProps {
  desbloqueado: boolean;
  onDesbloquear: (v: boolean) => void;
  consentimiento: boolean;
  onConsentimiento: (v: boolean) => void;
}

export function SeccionColectivo({
  values,
  onChange,
  desbloqueado,
  onDesbloquear,
  consentimiento,
  onConsentimiento,
}: SeccionColectivoProps) {
  return (
    <fieldset
      id="edit-seccion-colectivo"
      className="space-y-3 scroll-mt-4 rounded-lg border border-border p-3"
    >
      <legend className="px-1 text-sm font-medium">
        Datos de colectivo (categoría especial · RGPD Art. 9)
      </legend>

      <div className="flex items-center gap-2">
        <Checkbox
          id="edit-art9-desbloquear"
          checked={desbloqueado}
          onCheckedChange={(v) => {
            const abierto = v === true;
            onDesbloquear(abierto);
            // Cerrar el candado retira también la declaración: si se vuelve a
            // abrir, se vuelve a preguntar.
            if (!abierto) onConsentimiento(false);
          }}
        />
        <Label htmlFor="edit-art9-desbloquear" className="cursor-pointer">
          Editar los datos de colectivo
        </Label>
      </div>

      <GrupoCasillas
        idPrefijo="edit-colectivos"
        label="Pertenencia a colectivo"
        opciones={COLECTIVO_LABELS}
        disabled={!desbloqueado}
        valor={values.colectivos}
        onChange={(siguiente) => onChange("colectivos", siguiente as PersonCreate["colectivos"])}
      />

      <Texto
        id="edit-colectivo_otros"
        label="Otros (especificar)"
        maxLength={200}
        disabled={!desbloqueado}
        value={values.colectivo_otros}
        onChange={(v) => onChange("colectivo_otros", v)}
      />

      {desbloqueado && (
        <div className="flex items-start gap-2 border-t border-border pt-3">
          <Checkbox
            id="edit-colectivo_consentimiento"
            className="mt-0.5"
            checked={consentimiento}
            onCheckedChange={(v) => onConsentimiento(v === true)}
          />
          <Label
            htmlFor="edit-colectivo_consentimiento"
            className="cursor-pointer text-xs font-normal"
          >
            La persona consiente explícitamente el tratamiento de estos datos de
            categoría especial (RGPD Art. 9(2)(a)). Sin esta declaración no se
            guardan los cambios de colectivo; el resto de la ficha sí se guarda.
          </Label>
        </div>
      )}
    </fieldset>
  );
}
