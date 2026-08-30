/**
 * usePrograms — catálogo de programas para el wizard de alta.
 *
 * Sin catálogo de reserva a propósito: el que había traía slugs con guion y
 * UUIDs inventados, así que ante un fallo de base el voluntario veía seis
 * programas plausibles y falsos, y la inscripción reventaba contra la FK. Ese
 * colchón es además lo que mantuvo invisible durante meses el desfase del slug
 * del Programa Familias. Si la consulta falla, la lista queda vacía y el paso
 * de programa no deja continuar, que es la verdad.
 */
import { trpc } from "@/lib/trpc";

export function usePrograms() {
  return trpc.persons.programs.useQuery(undefined, {
    staleTime: 5 * 60_000, // 5 min — los programas cambian poco
  });
}
