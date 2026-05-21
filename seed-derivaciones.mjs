#!/usr/bin/env node

/**
 * Seed script para Derivaciones (Phase 3)
 * 
 * Inserta:
 * - 5 instituciones (públicas, ONGs, parroquias) con direcciones en Madrid
 * - 2 familias de prueba (si no existen)
 * - 1 persona de prueba (si no existe)
 * - 2 hojas de derivación (familia-scoped + persona-scoped)
 * - 3 intervenciones por hoja con diferentes tipos
 * 
 * Uso: node seed-derivaciones.mjs
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const INSTITUCIONES = [
  {
    nombre: 'Centro de Salud Aluche',
    tipo: 'publica',
    areas: ['salud', 'infancia'],
    direccion: 'Calle Aluche 15',
    codigo_postal: '28044',
    telefono: '91-555-0001',
    email: 'info@aluche.madrid.es',
  },
  {
    nombre: 'Cáritas Madrid',
    tipo: 'ong',
    areas: ['apoyo_logistico', 'alimentacion', 'vivienda'],
    direccion: 'Avenida de América 34',
    codigo_postal: '28028',
    telefono: '91-555-0002',
    email: 'contacto@caritas-madrid.org',
  },
  {
    nombre: 'Parroquia San Isidro',
    tipo: 'parroquia',
    areas: ['apoyo_logistico', 'alimentacion'],
    direccion: 'Plaza de San Isidro 5',
    codigo_postal: '28039',
    telefono: '91-555-0003',
    email: 'parroquia@sanisidro.es',
  },
  {
    nombre: 'Instituto de Empleo Social',
    tipo: 'publica',
    areas: ['empleo', 'formacion'],
    direccion: 'Calle Velázquez 120',
    codigo_postal: '28006',
    telefono: '91-555-0004',
    email: 'empleo@madrid.es',
  },
  {
    nombre: 'Fundación Abogados de Familia',
    tipo: 'ong',
    areas: ['juridico'],
    direccion: 'Paseo de la Castellana 200',
    codigo_postal: '28046',
    telefono: '91-555-0005',
    email: 'legal@abogados-familia.org',
  },
];

const TIPOS_INTERVENCION = [
  'salud',
  'apoyo_logistico',
  'vivienda',
  'juridico',
  'empleo',
  'alimentacion',
  'infancia',
  'salud_mental',
  'formacion',
  'otro',
];

async function seed() {
  console.log('🌱 Iniciando seed de Derivaciones...\n');

  try {
    // 1. Obtener un programa de prueba
    console.log('📋 Obteniendo programa de prueba...');
    const { data: programs, error: programsError } = await supabase
      .from('programs')
      .select('id')
      .limit(1);

    if (programsError || !programs?.length) {
      throw new Error('No programs found. Seed requires at least one program.');
    }

    const programId = programs[0].id;
    console.log(`✅ Programa encontrado: ${programId}\n`);

    // 2. Insertar instituciones
    console.log('🏢 Insertando instituciones...');
    // Verificar cuáles instituciones ya existen
    const { data: existingInst } = await supabase
      .from('instituciones')
      .select('nombre')
      .in('nombre', INSTITUCIONES.map((i) => i.nombre));

    const existingNames = new Set((existingInst || []).map((i) => i.nombre));
    const toInsert = INSTITUCIONES.filter((i) => !existingNames.has(i.nombre));

    let instituciones = [];

    if (toInsert.length > 0) {
      const { data: inserted, error: insError } = await supabase
        .from('instituciones')
        .insert(toInsert.map((inst) => ({ ...inst, created_by: 'seed-script' })))
        .select('id, nombre');

      if (insError) {
        throw new Error(`Error inserting instituciones: ${insError.message}`);
      }
      instituciones = inserted || [];
    }

    // Obtener todas (incluyendo las ya existentes)
    const { data: allInst, error: fetchErr } = await supabase
      .from('instituciones')
      .select('id, nombre')
      .in('nombre', INSTITUCIONES.map((i) => i.nombre));

    if (fetchErr) throw new Error(`Error fetching instituciones: ${fetchErr.message}`);
    instituciones = allInst || [];

    console.log(`✅ ${instituciones.length} instituciones insertadas\n`);

    // 3. Obtener o crear familias de prueba
    console.log('👨‍👩‍👧‍👦 Obteniendo/creando familias de prueba...');
    const { data: existingFamilias } = await supabase
      .from('families')
      .select('id')
      .limit(2);

    let familiaId1, familiaId2;

    if (existingFamilias && existingFamilias.length >= 2) {
      familiaId1 = existingFamilias[0].id;
      familiaId2 = existingFamilias[1].id;
      console.log(`✅ Familias existentes encontradas: ${familiaId1}, ${familiaId2}\n`);
    } else {
      console.log('⚠️  No hay suficientes familias. Usando familias existentes o saltando familia-scoped hoja.\n');
      if (existingFamilias?.length > 0) {
        familiaId1 = existingFamilias[0].id;
      }
    }

    // 4. Obtener o crear persona de prueba
    console.log('👤 Obteniendo/creando persona de prueba...');
    const { data: existingPersonas } = await supabase
      .from('persons')
      .select('id')
      .limit(1);

    let personaId;
    if (existingPersonas && existingPersonas.length > 0) {
      personaId = existingPersonas[0].id;
      console.log(`✅ Persona existente encontrada: ${personaId}\n`);
    } else {
      console.log('⚠️  No hay personas. Saltando persona-scoped hoja.\n');
    }

    // 5. Crear hojas de derivación (get-or-create — idempotente)
    console.log('📄 Creando hojas de derivación...');
    const hojas = [];

    async function getOrCreateHoja(insertData, label) {
      // Buscar hoja activa existente para esta entidad + programa
      const filter = insertData.scope === 'familia'
        ? { familia_id: insertData.familia_id, programa_id: insertData.programa_id }
        : { persona_id: insertData.persona_id, programa_id: insertData.programa_id };

      const { data: existing } = await supabase
        .from('derivacion_hojas')
        .select('id')
        .match({ ...filter, estado: 'activa' })
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`♻️  Hoja ${label} ya existe: ${existing[0].id}`);
        return existing[0].id;
      }

      const { data: created, error } = await supabase
        .from('derivacion_hojas')
        .insert(insertData)
        .select('id');

      if (error) {
        console.warn(`⚠️  Error creating ${label} hoja: ${error.message}`);
        return null;
      }
      console.log(`✅ Hoja ${label} creada: ${created[0].id}`);
      return created[0].id;
    }

    if (familiaId1) {
      const id = await getOrCreateHoja(
        {
          scope: 'familia',
          familia_id: familiaId1,
          programa_id: programId,
          profesional_id: 'prof-001',
          profesional_nombre: 'María García López',
          fecha_apertura: new Date().toISOString().split('T')[0],
          estado: 'activa',
        },
        'familia'
      );
      if (id) hojas.push({ id, scope: 'familia', entity: `familia ${familiaId1}` });
    }

    if (personaId) {
      const id = await getOrCreateHoja(
        {
          scope: 'persona',
          persona_id: personaId,
          programa_id: programId,
          profesional_id: 'prof-002',
          profesional_nombre: 'Juan Martínez Ruiz',
          fecha_apertura: new Date().toISOString().split('T')[0],
          estado: 'activa',
        },
        'persona'
      );
      if (id) hojas.push({ id, scope: 'persona', entity: `persona ${personaId}` });
    }

    if (hojas.length === 0) {
      console.log('❌ No hojas were created. Exiting seed.\n');
      return;
    }

    // 6. Crear intervenciones para cada hoja
    console.log('🔗 Creando intervenciones...');
    let interventionCount = 0;

    for (const hoja of hojas) {
      for (let i = 0; i < 3; i++) {
        const tipoSlug = TIPOS_INTERVENCION[i % TIPOS_INTERVENCION.length];
        const institucion = instituciones[i % instituciones.length];
        const fecha = new Date();
        fecha.setDate(fecha.getDate() - i);

        const { data: intervention, error: intError } = await supabase
          .from('derivacion_intervenciones')
          .insert({
            hoja_id: hoja.id,
            fecha: fecha.toISOString().split('T')[0],
            tipo_slug: tipoSlug,
            descripcion: `Intervención de ${tipoSlug} para ${hoja.entity}`,
            institucion_id: institucion.id,
            institucion_snapshot: {
              nombre: institucion.nombre,
              tipo: institucion.tipo,
              direccion: institucion.direccion,
              telefono: institucion.telefono,
              email: institucion.email,
            },
            observaciones: `Derivación realizada el ${new Date().toLocaleDateString('es-ES')}`,
            created_by: 'seed-script',
          })
          .select('id');

        if (intError) {
          console.warn(`⚠️  Error creating intervention: ${intError.message}`);
        } else {
          interventionCount++;
          console.log(`✅ Intervención ${i + 1} creada para ${hoja.scope} hoja: ${intervention[0].id}`);
        }
      }
    }

    console.log(`\n✅ Seed completado:`);
    console.log(`   - ${instituciones.length} instituciones`);
    console.log(`   - ${hojas.length} hojas de derivación`);
    console.log(`   - ${interventionCount} intervenciones`);
    console.log(`\n📊 Datos de prueba listos para validar el flujo en la UI.\n`);
  } catch (error) {
    console.error('❌ Error durante seed:', error.message);
    process.exit(1);
  }
}

seed();
