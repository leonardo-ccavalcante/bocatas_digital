/**
 * Deterministic GUF reference families for byte-equal format pinning.
 *
 * NOTE: This data set generates `tests/fixtures/guf-reference.csv` via the
 * current exporter. Once Espe/Sole deliver the real Banco de Alimentos GUF
 * reference template, replace this file (or the .csv directly) with the
 * authoritative version and tighten the round-trip assertions accordingly.
 */

interface ReferenceFamily {
  id: string;
  familia_numero: string;
  nombre_familia: string;
  contacto_principal: string;
  telefono: string;
  direccion: string;
  estado: string;
  fecha_creacion: string;
  miembros_count: number;
  docs_identidad: boolean;
  padron_recibido: boolean;
  justificante_recibido: boolean;
  consent_bocatas: boolean;
  consent_banco_alimentos: boolean;
  informe_social: boolean;
  informe_social_fecha: string | null;
  alta_en_guf: boolean;
  fecha_alta_guf: string | null;
  guf_verified_at: string | null;
}

interface ReferenceMember {
  id: string;
  familia_id: string;
  nombre: string;
  rol: string;
  relacion: string | null;
  fecha_nacimiento: string | null;
  estado: string;
}

interface ReferenceFamilyWithMembers {
  family: ReferenceFamily;
  members: ReferenceMember[];
}

export const GUF_REFERENCE_FAMILIES: ReferenceFamilyWithMembers[] = [
  {
    family: {
      id: '11111111-1111-4111-8111-111111111111',
      familia_numero: 'GUF-001',
      nombre_familia: 'García López',
      contacto_principal: 'Juan García',
      telefono: '+34-600-100-001',
      direccion: 'Calle Mayor 1, Madrid',
      estado: 'activo',
      fecha_creacion: '2026-01-15',
      miembros_count: 3,
      docs_identidad: true,
      padron_recibido: true,
      justificante_recibido: true,
      consent_bocatas: true,
      consent_banco_alimentos: true,
      informe_social: true,
      informe_social_fecha: '2025-12-15',
      alta_en_guf: true,
      fecha_alta_guf: '2026-01-10',
      guf_verified_at: '2026-04-10T00:00:00Z',
    },
    members: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
        familia_id: '11111111-1111-4111-8111-111111111111',
        nombre: 'María García',
        rol: 'titular',
        relacion: null,
        fecha_nacimiento: '1985-03-20',
        estado: 'activo',
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02',
        familia_id: '11111111-1111-4111-8111-111111111111',
        nombre: 'Pedro García',
        rol: 'miembro',
        relacion: 'hijo',
        fecha_nacimiento: '2015-06-10',
        estado: 'activo',
      },
    ],
  },
  {
    family: {
      id: '22222222-2222-4222-8222-222222222222',
      familia_numero: 'GUF-002',
      nombre_familia: 'Rodríguez Martín',
      contacto_principal: 'Ana Rodríguez',
      telefono: '+34-600-200-002',
      direccion: 'Avenida del Sol 22',
      estado: 'activo',
      fecha_creacion: '2026-02-20',
      miembros_count: 2,
      docs_identidad: false,
      padron_recibido: true,
      justificante_recibido: false,
      consent_bocatas: true,
      consent_banco_alimentos: false,
      informe_social: false,
      informe_social_fecha: null,
      alta_en_guf: false,
      fecha_alta_guf: null,
      guf_verified_at: null,
    },
    members: [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
        familia_id: '22222222-2222-4222-8222-222222222222',
        nombre: 'Ana Rodríguez',
        rol: 'titular',
        relacion: null,
        fecha_nacimiento: '1990-07-15',
        estado: 'activo',
      },
    ],
  },
  {
    family: {
      id: '33333333-3333-4333-8333-333333333333',
      familia_numero: 'GUF-003',
      nombre_familia: 'Diallo, Bambara',
      contacto_principal: 'Mamadou "Big" Diallo',
      telefono: '+34-600-300-003',
      direccion: 'Plaza Mayor 5',
      estado: 'activo',
      fecha_creacion: '2026-03-01',
      miembros_count: 4,
      docs_identidad: true,
      padron_recibido: true,
      justificante_recibido: true,
      consent_bocatas: true,
      consent_banco_alimentos: true,
      informe_social: true,
      informe_social_fecha: '2026-02-15',
      alta_en_guf: true,
      fecha_alta_guf: '2026-02-25',
      guf_verified_at: '2026-04-25T00:00:00Z',
    },
    members: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
        familia_id: '33333333-3333-4333-8333-333333333333',
        nombre: 'Mamadou Diallo',
        rol: 'titular',
        relacion: null,
        fecha_nacimiento: '1980-01-01',
        estado: 'activo',
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc02',
        familia_id: '33333333-3333-4333-8333-333333333333',
        nombre: 'Aminata Diallo',
        rol: 'miembro',
        relacion: 'esposa',
        fecha_nacimiento: '1985-08-20',
        estado: 'activo',
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc03',
        familia_id: '33333333-3333-4333-8333-333333333333',
        nombre: 'Ibrahim Diallo',
        rol: 'miembro',
        relacion: 'hijo',
        fecha_nacimiento: '2018-05-12',
        estado: 'activo',
      },
    ],
  },
];
