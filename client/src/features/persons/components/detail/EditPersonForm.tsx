/**
 * EditPersonForm — sólo la composición de las secciones.
 *
 * La lógica del parche vive en edit/editableFields.ts y cada bloque de campos
 * en su propio archivo: el formulario creció de 23 a 35 campos y en un solo
 * archivo habría cruzado el límite de 300 líneas, que es ERROR de lint.
 *
 * Los datos de colectivo (Art. 9) SÍ se editan aquí, tras un candado y con la
 * declaración de consentimiento explícito que el servidor exige. El resto de la
 * ficha se guarda igual aunque ese candado siga cerrado.
 */
import { SeccionCanal } from "./edit/SeccionCanal";
import { SeccionIdentidad } from "./edit/SeccionIdentidad";
import { SeccionDocumento } from "./edit/SeccionDocumento";
import { SeccionContacto } from "./edit/SeccionContacto";
import { SeccionVivienda } from "./edit/SeccionVivienda";
import { SeccionSituacion } from "./edit/SeccionSituacion";
import { SeccionSocial } from "./edit/SeccionSocial";
import { SeccionColectivo } from "./edit/SeccionColectivo";
import type { SeccionProps } from "./edit/_controls";

export type { EditableValues } from "./edit/editableFields";

interface EditPersonFormProps extends SeccionProps {
  art9Desbloqueado: boolean;
  onArt9Desbloquear: (v: boolean) => void;
  consentimientoArt9: boolean;
  onConsentimientoArt9: (v: boolean) => void;
}

export function EditPersonForm({
  values,
  onChange,
  isAdmin,
  art9Desbloqueado,
  onArt9Desbloquear,
  consentimientoArt9,
  onConsentimientoArt9,
}: EditPersonFormProps) {
  const props: SeccionProps = { values, onChange, isAdmin };

  return (
    <div className="space-y-6">
      <SeccionIdentidad {...props} />
      <SeccionDocumento {...props} />
      <SeccionContacto {...props} />
      <SeccionVivienda {...props} />
      <SeccionSituacion {...props} />
      <SeccionSocial {...props} />
      <SeccionCanal {...props} />
      <SeccionColectivo
        {...props}
        desbloqueado={art9Desbloqueado}
        onDesbloquear={onArt9Desbloquear}
        consentimiento={consentimientoArt9}
        onConsentimiento={onConsentimientoArt9}
      />
    </div>
  );
}
