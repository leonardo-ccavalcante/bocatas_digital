import { useMemo } from 'react';

export interface Program {
  id: string;
  nombre: string;
}

export const AVAILABLE_ROLES = ['voluntario', 'admin', 'superadmin', 'beneficiario'] as const;

/**
 * Hook that provides available programs and roles for audience targeting.
 * Programs are hardcoded based on the database schema.
 * Roles are the standard user roles in the system.
 */
export function useAudienceOptions() {
  const programs: Program[] = useMemo(
    () => [
      { id: 'formacion', nombre: 'Formación' },
      { id: 'familia', nombre: 'Familia' },
      { id: 'comedor', nombre: 'Comedor' },
      { id: 'atencion_juridica', nombre: 'Atención Jurídica' },
      { id: 'voluntariado', nombre: 'Voluntariado' },
      { id: 'acompanamiento', nombre: 'Acompañamiento' },
    ],
    []
  );

  const roles = useMemo(() => [...AVAILABLE_ROLES], []);

  return { programs, roles };
}
