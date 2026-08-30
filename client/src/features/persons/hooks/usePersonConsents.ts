/**
 * usePersonConsents — consentimientos YA registrados de una persona.
 *
 * El escudo de la ficha nunca leyó la tabla `consents`: era un formulario de
 * captura sobre el catálogo de plantillas, así que las casillas salían
 * desmarcadas aunque la persona hubiera firmado (FAMILIAS-7). La siembra vive
 * aquí y no en ConsentModal porque el modal ya roza el tope de 300 líneas que
 * el gate de eslint trata como error.
 */
import { useMemo } from "react";
import { trpc, type RouterOutputs } from "@/lib/trpc";

export type SavedConsent = RouterOutputs["persons"]["getPersonConsents"][number];

export interface ConsentState {
  granted: boolean;
  documentoFotoUrl?: string;
  /**
   * Fecha de la firma que YA estaba guardada. Marca la frontera entre "esto ya
   * consta" y "esto lo acaba de marcar el voluntario": sólo lo segundo se
   * persiste, para no re-sellar con la fecha de hoy un registro que tiene valor
   * de firma manuscrita.
   */
  firmadoEl?: string;
  version?: string;
  revocadoEl?: string;
}

const FORMATO_FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

function formatearFecha(iso: string): string | null {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? null : FORMATO_FECHA.format(fecha);
}

/** Estado inicial de las casillas a partir de lo que consta en la BD. */
export function seedConsentState(
  saved: readonly SavedConsent[]
): Record<string, ConsentState> {
  const estado: Record<string, ConsentState> = {};
  for (const consent of saved) {
    // Un consentimiento revocado deja de estar otorgado: la casilla se
    // desmarca, pero la revocación se muestra para que nadie la dé por perdida.
    const vigente = consent.granted && !consent.revoked_at;
    estado[consent.purpose] = {
      granted: vigente,
      firmadoEl: vigente ? (consent.granted_at ?? undefined) : undefined,
      version: consent.consent_version || undefined,
      revocadoEl: consent.revoked_at ?? undefined,
    };
  }
  return estado;
}

/** Línea de firma que ve el equipo: qué versión aceptó y cuándo. */
export function describeConsentSignature(
  state: ConsentState | undefined
): string | null {
  if (!state) return null;
  if (state.revocadoEl) {
    const fecha = formatearFecha(state.revocadoEl);
    return fecha ? `Revocado el ${fecha}` : "Revocado";
  }
  if (!state.firmadoEl) return null;
  const fecha = formatearFecha(state.firmadoEl);
  const version = state.version ? ` · v${state.version}` : "";
  return fecha ? `Firmado el ${fecha}${version}` : `Firmado${version}`;
}

/**
 * Lo que YA consta firmado, como base de sólo lectura.
 *
 * A propósito NO posee el estado de las casillas: ese lo lleva el modal, que
 * distingue lo TOCADO en esta sesión de lo que ya estaba: sólo lo tocado se
 * persiste, para no re-sellar con la fecha de hoy un registro que tiene valor
 * de firma manuscrita ante el Banco de Alimentos.
 */
export function useSavedConsents(personId: string, open: boolean) {
  const { data, isLoading, isError } = trpc.persons.getPersonConsents.useQuery(
    { personId },
    { enabled: open && !!personId, staleTime: 30_000 }
  );

  const firmados = useMemo(() => seedConsentState(data ?? []), [data]);

  // `cargaFallida` se expone en vez de tragarse el error: un modal con las
  // casillas vacías porque la lectura falló es indistinguible de una persona
  // que no ha firmado nada, y esa confusión acaba en una firma duplicada.
  return {
    firmados,
    isLoadingSaved: open && isLoading,
    cargaFallida: open && isError,
  };
}
