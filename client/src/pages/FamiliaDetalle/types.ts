/**
 * Shared types for the FamiliaDetalle page and its sub-components.
 * Titular is the superset of all fields used across FamiliaHeader, InfoTab and
 * index — canal_llegada and fecha_nacimiento are optional because the persons
 * row may not carry them in every query projection.
 */

export interface Titular {
  id: string;
  nombre: string;
  apellidos: string | null;
  telefono: string | null;
  fecha_nacimiento: string | null;
  canal_llegada?: string | null;
}
