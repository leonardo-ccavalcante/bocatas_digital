/**
 * personaEstado — derives the "estado" chip variant for a person from their
 * itinerary phase. Pure helper, shared by the header and resumen tab.
 *
 * No fabricated data: the label is the real `fase_itinerario` enum value.
 */
import type { Database } from "@/lib/database.types";

type Fase = Database["public"]["Enums"]["fase_itinerario"];

export interface EstadoChip {
  label: string;
  /** Badge variant from shadcn Badge. */
  variant: "default" | "secondary" | "outline";
}

const FASE_LABEL: Record<string, string> = {
  acogida: "Acogida",
  estabilizacion: "Estabilización",
  formacion: "Formación",
  insercion_laboral: "Inserción laboral",
  autonomia: "Autonomía",
};

/** Active phases get the brand-primary chip; the rest stay neutral. */
export function getEstadoChip(fase: Fase | null | undefined): EstadoChip {
  if (!fase) return { label: "Sin fase", variant: "outline" };
  const label = FASE_LABEL[fase] ?? fase;
  const variant: EstadoChip["variant"] =
    fase === "insercion_laboral" || fase === "autonomia" ? "default" : "secondary";
  return { label, variant };
}
