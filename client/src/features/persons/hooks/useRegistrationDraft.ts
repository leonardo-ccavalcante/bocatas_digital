/**
 * useRegistrationDraft — conecta el borrador del alta al formulario.
 *
 * Guarda con retardo (no en cada tecla) suscribiéndose a `watch` en su forma de
 * callback: la forma `watch()` sin argumentos re-renderiza el wizard entero con
 * cada pulsación, y el dispositivo primario es un Android de gama baja.
 *
 * Qué se guarda y por qué en sessionStorage: ver utils/registrationDraft.ts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { UseFormWatch, UseFormReset } from "react-hook-form";
import type { PersonCreate } from "../schemas";
import {
  guardarBorrador,
  leerBorrador,
  borrarBorrador,
  mereceGuardarse,
  type Borrador,
} from "../utils/registrationDraft";

const RETARDO_MS = 800;

interface Args {
  watch: UseFormWatch<PersonCreate>;
  reset: UseFormReset<PersonCreate>;
  fase: number;
  setFase: (f: number) => void;
}

export function useRegistrationDraft({ watch, reset, fase, setFase }: Args) {
  const [borradorPendiente, setBorradorPendiente] = useState<Borrador | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // La fase viaja por ref para no re-suscribir el watch en cada paso.
  const faseRef = useRef(fase);
  faseRef.current = fase;
  // Mientras haya un borrador ofrecido no se guarda encima: si no, el
  // formulario vacío que se está mostrando lo machacaría antes de que a nadie
  // le dé tiempo a pulsar "Recuperar".
  const ofreciendo = useRef(false);

  useEffect(() => {
    const encontrado = leerBorrador();
    if (encontrado) {
      ofreciendo.current = true;
      setBorradorPendiente(encontrado);
    }
  }, []);

  useEffect(() => {
    const sub = watch((valores) => {
      if (ofreciendo.current) return;
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => {
        const v = valores as Record<string, unknown>;
        if (mereceGuardarse(v)) guardarBorrador(v, faseRef.current);
      }, RETARDO_MS);
    });
    return () => {
      sub.unsubscribe();
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [watch]);

  const recuperar = useCallback(() => {
    if (!borradorPendiente) return;
    reset(borradorPendiente.valores as Partial<PersonCreate>, { keepDefaultValues: true });
    setFase(borradorPendiente.fase);
    ofreciendo.current = false;
    setBorradorPendiente(null);
  }, [borradorPendiente, reset, setFase]);

  const descartar = useCallback(() => {
    borrarBorrador();
    ofreciendo.current = false;
    setBorradorPendiente(null);
  }, []);

  /** Tras crear la ficha: el borrador ya no representa nada pendiente. */
  const limpiar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    borrarBorrador();
  }, []);

  return { borradorPendiente, recuperar, descartar, limpiar };
}
