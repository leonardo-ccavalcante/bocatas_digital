/** Contacto y dirección. `distrito` lo deriva un trigger desde codigo_postal. */
import { Seccion, Texto, type SeccionProps } from "./_controls";

export function SeccionContacto({ values, onChange }: SeccionProps) {
  return (
    <Seccion titulo="Contacto" id="edit-seccion-contacto">
      <div className="grid grid-cols-2 gap-3">
        <Texto id="edit-telefono" label="Teléfono" value={values.telefono} inputMode="tel" onChange={(v) => onChange("telefono", v)} />
        <Texto id="edit-email" label="Email" value={values.email} inputMode="email" onChange={(v) => onChange("email", v)} />
      </div>
      <Texto id="edit-direccion" label="Dirección" value={values.direccion} onChange={(v) => onChange("direccion", v)} />
      <div className="grid grid-cols-3 gap-3">
        <Texto id="edit-codigo_postal" label="Código postal" value={values.codigo_postal} inputMode="numeric" onChange={(v) => onChange("codigo_postal", v)} />
        <Texto id="edit-municipio" label="Municipio" value={values.municipio} onChange={(v) => onChange("municipio", v)} />
        <Texto id="edit-barrio_zona" label="Barrio o zona" value={values.barrio_zona} onChange={(v) => onChange("barrio_zona", v)} />
      </div>
    </Seccion>
  );
}
