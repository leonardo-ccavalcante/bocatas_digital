/** Cómo llegó la persona. Ningún paso del alta lo dejaba corregir después. */
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { InstitucionTypeahead } from "@/features/derivar/InstitucionTypeahead";
import type { InstitucionPickedItem } from "@/features/derivar/CrearInstitucionInlineModal";
import { CANAL_LLEGADA_LABELS, type PersonCreate } from "../../../schemas";
import { SelectField } from "../../RegistrationWizard/_shared";
import { Seccion, Texto, AreaTexto, type SeccionProps } from "./_controls";

export function SeccionCanal({ values, onChange }: SeccionProps) {
  // El formulario guarda TEXT (entidad_derivadora); el catálogo sólo asiste.
  const [institucion, setInstitucion] = useState<InstitucionPickedItem | null>(null);
  return (
    <Seccion titulo="Canal de llegada" id="edit-seccion-canal">
      <SelectField
        label="Canal de llegada"
        id="edit-canal_llegada"
        value={values.canal_llegada ?? ""}
        onChange={(v) => {
          onChange("canal_llegada", v as PersonCreate["canal_llegada"]);
          // El motivo pertenece al canal «Bocatas»: al salir de él se limpia,
          // si no quedaba pegado (e invisible) al canal nuevo.
          if (v !== "retorno_bocatas") onChange("motivo_retorno", null);
        }}
        options={CANAL_LLEGADA_LABELS}
      />
      {values.canal_llegada === "retorno_bocatas" && (
        <AreaTexto
          id="edit-motivo_retorno"
          label="Motivo del retorno"
          maxLength={500}
          value={values.motivo_retorno}
          onChange={(v) => onChange("motivo_retorno", v)}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="edit-entidad_derivadora">Entidad derivadora</Label>
          <InstitucionTypeahead
            id="edit-entidad_derivadora"
            value={institucion}
            text={values.entidad_derivadora ?? ""}
            onChange={setInstitucion}
            onTextChange={(t) => onChange("entidad_derivadora", t === "" ? null : t)}
            allowCreate={false}
          />
        </div>
        <Texto
          id="edit-persona_referencia"
          label="Persona de referencia"
          maxLength={200}
          value={values.persona_referencia}
          onChange={(v) => onChange("persona_referencia", v)}
        />
      </div>
    </Seccion>
  );
}
