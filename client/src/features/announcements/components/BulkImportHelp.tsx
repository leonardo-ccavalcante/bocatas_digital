/**
 * BulkImportHelp.tsx — collapsible inline guide for the bulk-import modal.
 *
 * Mirrors the long-form docs/novedades-bulk-import-guide.md. Hand-coded
 * markup (not rendered from markdown) to avoid pulling a markdown parser
 * just for this one file.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2 text-left text-xs font-medium text-gray-700 hover:text-[#C41230]"
        aria-expanded={open}
      >
        <span>{title}</span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        )}
      </button>
      {open && <div className="pb-3 text-xs text-gray-600">{children}</div>}
    </div>
  );
}

export function BulkImportHelp() {
  return (
    <details className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 text-blue-900">
      <summary className="cursor-pointer text-xs font-medium flex items-center gap-1.5">
        <HelpCircle className="w-3.5 h-3.5" />
        Cómo funciona el CSV (clic para ver guía)
      </summary>

      <div className="mt-2 space-y-0">
        <Section title="1. Columnas del CSV (en orden)" defaultOpen>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>
              <code>titulo</code> — obligatorio, máx. 200 caracteres
            </li>
            <li>
              <code>contenido</code> — obligatorio, máx. 5000 caracteres
            </li>
            <li>
              <code>tipo</code> — obligatorio.{" "}
              <code>info</code> · <code>evento</code> ·{" "}
              <code>cierre_servicio</code> · <code>convocatoria</code>
            </li>
            <li>
              <code>es_urgente</code> — opcional. <code>true</code> o{" "}
              <code>false</code>
            </li>
            <li>
              <code>fecha_inicio</code> — opcional. ISO 8601 (
              <code>2026-05-01T08:00</code>)
            </li>
            <li>
              <code>fecha_fin</code> — opcional. ISO 8601
            </li>
            <li>
              <code>fijado</code> — opcional. <code>true</code> o{" "}
              <code>false</code>
            </li>
            <li>
              <code>audiencias</code> — obligatorio, ver sección 2
            </li>
          </ol>
        </Section>

        <Section title="2. Sintaxis de audiencias">
          <p className="mb-1">
            Cada regla es <code>roles:programas</code>. Reglas múltiples
            separadas por <code>;</code>.{" "}
            <code>*</code> = todos en esa dimensión. Roles o programas
            múltiples se separan por <code>,</code>.
          </p>
          <table className="w-full mt-2 text-[11px]">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pr-3 py-1">DSL</th>
                <th>Significado</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[11px]">
              <tr className="border-t border-blue-100">
                <td className="pr-3 py-1">voluntario:comedor</td>
                <td className="font-sans">Voluntarios del comedor</td>
              </tr>
              <tr className="border-t border-blue-100">
                <td className="pr-3 py-1">admin,superadmin:*</td>
                <td className="font-sans">Todos los admins</td>
              </tr>
              <tr className="border-t border-blue-100">
                <td className="pr-3 py-1">*:familia,formacion</td>
                <td className="font-sans">
                  Cualquier rol en Familias o Formación
                </td>
              </tr>
              <tr className="border-t border-blue-100">
                <td className="pr-3 py-1">*:*</td>
                <td className="font-sans">Todos los usuarios</td>
              </tr>
              <tr className="border-t border-blue-100">
                <td className="pr-3 py-1">
                  voluntario:comedor;admin:*
                </td>
                <td className="font-sans">
                  Voluntarios del comedor O admins
                </td>
              </tr>
              <tr className="border-t border-blue-100">
                <td className="pr-3 py-1">
                  admin:*;voluntario:voluntariado
                </td>
                <td className="font-sans">
                  Admins O voluntarios del programa de voluntariado
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section title="3. Errores típicos">
          <ul className="space-y-0.5 list-disc pl-4">
            <li>
              <strong>tipo no válido</strong>: usaste <code>cierre</code> o{" "}
              <code>urgente</code> (heredados). Usa{" "}
              <code>cierre_servicio</code> o <code>info</code>+
              <code>es_urgente=true</code>.
            </li>
            <li>
              <strong>fecha_fin &lt; fecha_inicio</strong>: corrige el orden.
            </li>
            <li>
              <strong>preview expirado</strong>: tardaste &gt;30 min entre
              subir y confirmar. Vuelve a subir el CSV.
            </li>
          </ul>
        </Section>

        <Section title="4. ¿Y si me equivoco?">
          <p>
            Cada novedad importada es editable y eliminable desde{" "}
            <code>/admin/novedades</code> después de la importación. Nada es
            permanente.
          </p>
        </Section>
      </div>
    </details>
  );
}
