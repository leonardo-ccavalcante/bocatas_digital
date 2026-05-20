/**
 * Local types for the InstitucionesPage feature.
 * Mirrors the DB row shape returned by trpc.instituciones.list.
 */

export type InstitucionRow = {
  id: string;
  nombre: string;
  tipo: string | null;
  areas: string[];
  direccion: string | null;
  codigo_postal: string | null;
  distrito: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
