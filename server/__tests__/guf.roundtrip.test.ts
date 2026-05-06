import { describe, it, expect } from 'vitest';
import { generateFamiliesCSVWithMembers } from '../csvExportWithMembers';
import { parseFamiliesWithMembersCSV } from '../csvImportWithMembers';

/**
 * B.3.2 — Round-trip (export -> import -> export) preserves the GUF-relevant
 * fields. Non-deterministic columns (uuids generated on insert, created_at)
 * are not regenerated here — the round-trip is purely data-shape, no DB.
 *
 * Fields under contract:
 *   familia_numero, telefono, alta_en_guf, fecha_alta_guf,
 *   miembros_count (per family), titular nombre (first member with rol=titular)
 *
 * NOTE: idioma_principal is referenced in the plan but is not yet present in
 * the families schema or the exporter — see TODO at bottom of file. When the
 * field is added, extend the assertions below.
 */

interface RoundTripFamily {
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

interface RoundTripMember {
  id: string;
  familia_id: string;
  nombre: string;
  rol: string;
  relacion: string | null;
  fecha_nacimiento: string | null;
  estado: string;
}

interface RoundTripFamilyWithMembers {
  family: RoundTripFamily;
  members: RoundTripMember[];
}

function deterministicUuid(prefix: string, n: number): string {
  // Build a fixed-length UUID v4-like string from a prefix + counter so tests
  // are reproducible across machines.
  const tail = n.toString(16).padStart(12, '0');
  const block = prefix.padStart(8, '0').slice(0, 8);
  return `${block}-0000-4000-8000-${tail}`;
}

function buildFamilies(count: number): RoundTripFamilyWithMembers[] {
  const result: RoundTripFamilyWithMembers[] = [];
  for (let i = 1; i <= count; i++) {
    const id = deterministicUuid(i.toString(16).padStart(2, '0').repeat(4), i);
    const memberCount = ((i - 1) % 3) + 1; // 1, 2, or 3 members deterministically
    const altaEnGuf = i % 2 === 0;
    const fechaAltaGuf = altaEnGuf ? `2026-0${(i % 9) + 1}-15` : null;

    const members: RoundTripMember[] = [];
    members.push({
      id: deterministicUuid(`a${i.toString(16)}`, i * 10),
      familia_id: id,
      nombre: `Titular ${i}`,
      rol: 'titular',
      relacion: null,
      fecha_nacimiento: '1985-01-01',
      estado: 'activo',
    });
    for (let m = 1; m < memberCount; m++) {
      members.push({
        id: deterministicUuid(`b${i.toString(16)}`, i * 10 + m),
        familia_id: id,
        nombre: `Miembro ${i}-${m}`,
        rol: 'miembro',
        relacion: 'hijo',
        fecha_nacimiento: '2015-06-10',
        estado: 'activo',
      });
    }

    result.push({
      family: {
        id,
        familia_numero: `RT-${i.toString().padStart(3, '0')}`,
        nombre_familia: `Familia ${i}`,
        contacto_principal: `Contacto ${i}`,
        telefono: `+34-600-${i.toString().padStart(3, '0')}-000`,
        direccion: `Calle ${i}`,
        estado: 'activo',
        fecha_creacion: '2026-01-01',
        miembros_count: memberCount,
        docs_identidad: i % 2 === 0,
        padron_recibido: i % 3 === 0,
        justificante_recibido: i % 4 === 0,
        consent_bocatas: true,
        consent_banco_alimentos: i % 2 === 0,
        informe_social: i % 5 === 0,
        informe_social_fecha: i % 5 === 0 ? '2026-01-01' : null,
        alta_en_guf: altaEnGuf,
        fecha_alta_guf: fechaAltaGuf,
        guf_verified_at: altaEnGuf ? '2026-04-01T00:00:00Z' : null,
      },
      members,
    });
  }
  return result;
}

interface ReconstructedFamily {
  familia_id: string;
  familia_numero: string;
  telefono: string;
  alta_en_guf: boolean;
  fecha_alta_guf: string | null;
  miembros_count: number;
  titular_nombre: string | null;
  member_ids: string[];
}

function reconstructFromCSV(csv: string): Map<string, ReconstructedFamily> {
  const records = parseFamiliesWithMembersCSV(csv);
  const byFamilia = new Map<string, ReconstructedFamily>();

  for (const row of records) {
    const familiaId = String(row.familia_id ?? '');
    if (!familiaId) continue;

    const existing = byFamilia.get(familiaId);
    const miembroNombre =
      typeof row.miembro_nombre === 'string' ? row.miembro_nombre : null;
    const miembroRol =
      typeof row.miembro_rol === 'string' ? row.miembro_rol : null;
    const miembroId =
      typeof row.miembro_id === 'string' ? row.miembro_id : null;

    if (!existing) {
      byFamilia.set(familiaId, {
        familia_id: familiaId,
        familia_numero: String(row.familia_numero ?? ''),
        telefono: String(row.telefono ?? ''),
        alta_en_guf: row.alta_en_guf === true,
        fecha_alta_guf:
          typeof row.fecha_alta_guf === 'string' ? row.fecha_alta_guf : null,
        miembros_count: Number(row.miembros_count ?? 0),
        titular_nombre:
          miembroRol === 'titular' && miembroNombre ? miembroNombre : null,
        member_ids: miembroId ? [miembroId] : [],
      });
    } else {
      if (miembroRol === 'titular' && miembroNombre && !existing.titular_nombre) {
        existing.titular_nombre = miembroNombre;
      }
      if (miembroId) existing.member_ids.push(miembroId);
    }
  }

  return byFamilia;
}

describe('GUF CSV round-trip (export -> import)', () => {
  it('preserves familia_numero, telefono, alta_en_guf, fecha_alta_guf, miembros_count, titular nombre across 20 families', () => {
    const families = buildFamilies(20);
    const csv = generateFamiliesCSVWithMembers(families, 'update');
    const reconstructed = reconstructFromCSV(csv);

    expect(reconstructed.size).toBe(20);

    for (const fwm of families) {
      const r = reconstructed.get(fwm.family.id);
      expect(r, `family ${fwm.family.familia_numero} should be parseable`).toBeDefined();
      if (!r) continue;

      expect(r.familia_numero).toBe(fwm.family.familia_numero);
      expect(r.telefono).toBe(fwm.family.telefono);
      expect(r.alta_en_guf).toBe(fwm.family.alta_en_guf);
      expect(r.fecha_alta_guf).toBe(fwm.family.fecha_alta_guf);
      expect(r.miembros_count).toBe(fwm.family.miembros_count);

      const titular = fwm.members.find((m) => m.rol === 'titular');
      expect(r.titular_nombre).toBe(titular ? titular.nombre : null);

      // Member ids should round-trip exactly (one row per member in 'update' mode)
      const expectedMemberIds = fwm.members.map((m) => m.id).sort();
      const actualMemberIds = [...r.member_ids].sort();
      expect(actualMemberIds).toEqual(expectedMemberIds);
    }
  });

  it('export -> import -> export is stable (re-export equals first export)', () => {
    const families = buildFamilies(20);
    const csv1 = generateFamiliesCSVWithMembers(families, 'update');

    // Re-build the family-with-members structure by reading the CSV back.
    const records = parseFamiliesWithMembersCSV(csv1);
    const byFamilia = new Map<string, RoundTripFamilyWithMembers>();
    const familyOrder: string[] = [];

    for (const row of records) {
      const familiaId = String(row.familia_id ?? '');
      if (!familiaId) continue;

      let entry = byFamilia.get(familiaId);
      if (!entry) {
        entry = {
          family: {
            id: familiaId,
            familia_numero: String(row.familia_numero ?? ''),
            nombre_familia: String(row.nombre_familia ?? ''),
            contacto_principal: String(row.contacto_principal ?? ''),
            telefono: String(row.telefono ?? ''),
            direccion: String(row.direccion ?? ''),
            estado: String(row.estado ?? 'activo'),
            fecha_creacion: String(row.fecha_creacion ?? ''),
            miembros_count: Number(row.miembros_count ?? 0),
            docs_identidad: row.docs_identidad === true,
            padron_recibido: row.padron_recibido === true,
            justificante_recibido: row.justificante_recibido === true,
            consent_bocatas: row.consent_bocatas === true,
            consent_banco_alimentos: row.consent_banco_alimentos === true,
            informe_social: row.informe_social === true,
            informe_social_fecha:
              typeof row.informe_social_fecha === 'string'
                ? row.informe_social_fecha
                : null,
            alta_en_guf: row.alta_en_guf === true,
            fecha_alta_guf:
              typeof row.fecha_alta_guf === 'string'
                ? row.fecha_alta_guf
                : null,
            guf_verified_at:
              typeof row.guf_verified_at === 'string'
                ? row.guf_verified_at
                : null,
          },
          members: [],
        };
        byFamilia.set(familiaId, entry);
        familyOrder.push(familiaId);
      }

      const miembroId =
        typeof row.miembro_id === 'string' ? row.miembro_id : '';
      if (miembroId) {
        entry.members.push({
          id: miembroId,
          familia_id: familiaId,
          nombre: String(row.miembro_nombre ?? ''),
          rol: String(row.miembro_rol ?? ''),
          relacion:
            typeof row.miembro_relacion === 'string'
              ? row.miembro_relacion
              : null,
          fecha_nacimiento:
            typeof row.miembro_fecha_nacimiento === 'string'
              ? row.miembro_fecha_nacimiento
              : null,
          estado: String(row.miembro_estado ?? 'activo'),
        });
      }
    }

    const reconstructed = familyOrder.map((id) => {
      const entry = byFamilia.get(id);
      if (!entry) throw new Error(`family ${id} missing during reconstruction`);
      return entry;
    });
    const csv2 = generateFamiliesCSVWithMembers(reconstructed, 'update');

    expect(csv2).toBe(csv1);
  });

  // TODO(B.3 exit): once `idioma_principal` is added to the families schema and
  // the exporter, extend round-trip coverage to include it.
});
