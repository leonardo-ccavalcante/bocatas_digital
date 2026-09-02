/**
 * EnrollmentsContactoToolbar.tsx — «copiar correos» del curso, «copiar
 * teléfonos con WhatsApp», y las listas de a quién hay que buscar de otra
 * forma: quien no tiene el dato y quien no ha dado ese consentimiento.
 *
 * Copia lo que se está viendo (el filtro y la página actuales), que es justo
 * lo que se pide al preparar un aviso. Cuando la página no llega a todos los
 * inscritos lo dice en vez de copiar 50 en silencio.
 *
 * El botón de teléfonos copia SÓLO a quien tiene `comunicaciones_whatsapp`
 * concedido y no retirado (lo marca el servidor en `puede_whatsapp`). En
 * producción hoy hay 60 negativas frente a 23 síes: copiar la columna entera
 * sería preparar una difusión contra la mayoría de la lista. Quien no ha
 * consentido sale por NOMBRE, nunca por número: la lista es para saber a
 * quién preguntar, no para pegarla en WhatsApp.
 *
 * Sólo se monta para admin: `programs.getEnrollments` es adminProcedure y el
 * contacto ni siquiera viaja para un voluntario.
 */
import { Button } from "@/components/ui/button";
import { Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import {
  repartirContacto,
  formatearParaPegar,
  type CanalContacto,
  type PersonaContacto,
} from "../utils/enrollmentContacto";

interface EnrollmentsContactoToolbarProps {
  personas: readonly PersonaContacto[];
  /** Total de inscritos que casan con el filtro (puede superar la página). */
  total: number;
}

/** Lista plegable de nombres — «a estos hay que buscarlos por otro lado». */
function ListaNombres({
  titulo,
  nombres,
  nota,
}: {
  titulo: string;
  nombres: readonly string[];
  nota?: string;
}) {
  if (nombres.length === 0) return null;
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none hover:text-foreground">
        {titulo} ({nombres.length})
      </summary>
      {nota && <p className="mt-1.5 ml-4 max-w-prose">{nota}</p>}
      <ul className="mt-1.5 ml-4 list-disc space-y-0.5">
        {nombres.map((nombre, i) => (
          <li key={`${nombre}-${i}`}>{nombre}</li>
        ))}
      </ul>
    </details>
  );
}

export function EnrollmentsContactoToolbar({
  personas,
  total,
}: EnrollmentsContactoToolbarProps) {
  const correos = repartirContacto(personas, "email");
  const telefonos = repartirContacto(personas, "telefono");
  const parcial = personas.length < total;

  async function copiar(canal: CanalContacto, valores: readonly string[]) {
    const etiqueta = canal === "email" ? "correo" : "teléfono";
    if (valores.length === 0) {
      toast.warning(
        canal === "email"
          ? "Ninguna de las personas de esta lista tiene correo"
          : "Nadie de esta lista tiene teléfono y consentimiento de WhatsApp"
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(formatearParaPegar(valores));
      toast.success(
        `${valores.length} ${etiqueta}${valores.length === 1 ? "" : "s"} copiado${valores.length === 1 ? "" : "s"}`
      );
    } catch {
      toast.error("No se pudo copiar al portapapeles");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8"
          onClick={() => void copiar("email", correos.valores)}
          aria-label="Copiar los correos de las personas de esta lista"
        >
          <Mail className="w-3.5 h-3.5 mr-1.5" />
          Copiar correos ({correos.valores.length})
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8"
          onClick={() => void copiar("telefono", telefonos.valores)}
          aria-label="Copiar los teléfonos de quien ha autorizado las comunicaciones por WhatsApp"
        >
          <Phone className="w-3.5 h-3.5 mr-1.5" />
          Copiar teléfonos con WhatsApp ({telefonos.valores.length})
        </Button>
      </div>

      {parcial && (
        <p className="text-xs text-amber-700">
          Se copian las {personas.length} personas de esta página, de {total} en el filtro.
        </p>
      )}

      <ListaNombres titulo="Sin email" nombres={correos.sinDato} />

      <ListaNombres
        titulo="Sin consentimiento de WhatsApp"
        nombres={telefonos.sinConsentimiento}
        nota="Tienen teléfono, pero no consta que hayan autorizado las comunicaciones por WhatsApp, así que no entran en la copia. Para incluirlos hay que pedírselo y registrarlo en su ficha."
      />

      <ListaNombres titulo="Sin teléfono" nombres={telefonos.sinDato} />
    </div>
  );
}
