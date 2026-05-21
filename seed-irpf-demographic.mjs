/**
 * Seed script para E2 IRPF Demographic Report
 * 
 * Inserta datos de prueba en:
 * 1. families (familias de prueba)
 * 2. persons (miembros con datos demográficos variados)
 * 3. familia_miembros (relaciones familia-persona)
 * 
 * Objetivo: generar datos representativos para validar:
 * - Marginals (5 dimensiones: edad, género, educación, empleo, nacionalidad)
 * - Cross-tab (5-way)
 * - K-anonymity suppression (floor = 3)
 * - CSV export
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYyMzI0MTAwMCwiZXhwIjoxNzU0Nzc3NjAwfQ.V-PQs6HzJe8dIp4-5jQ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5';

const supabase = createClient(supabaseUrl, supabaseKey);

// Enums demográficos
const GENEROS = ['masculino', 'femenino', 'no_binario', 'prefiere_no_decir'];
const NIVELES_ESTUDIOS = ['sin_estudios', 'primaria', 'secundaria', 'bachillerato', 'formacion_profesional', 'universitario', 'postgrado'];
const SITUACIONES_LABORALES = ['desempleado', 'economia_informal', 'empleo_temporal', 'empleo_indefinido', 'autonomo', 'en_formacion', 'jubilado', 'incapacidad_permanente', 'sin_permiso_trabajo'];
const PAISES_ORIGEN = ['ES', 'MA', 'SY', 'GN', 'ML', 'SN', 'CI', 'NG', 'RO', 'BG', 'PK', 'AF', 'BD', 'UZ', 'KZ'];

// Nombres de prueba (variados)
const NOMBRES = [
  'Ahmed', 'Fatima', 'Mohammad', 'Aisha', 'Hassan', 'Layla',
  'Juan', 'María', 'Carlos', 'Rosa', 'Pedro', 'Ana',
  'Mihai', 'Elena', 'Ion', 'Cristina', 'Andrei', 'Simona',
  'Kofi', 'Ama', 'Kwame', 'Akosua', 'Yaw', 'Adwoa',
];

const APELLIDOS = [
  'Ahmed', 'Hassan', 'Ibrahim', 'Saleh', 'Mustafa',
  'García', 'López', 'Martínez', 'Rodríguez', 'Pérez',
  'Popescu', 'Ionescu', 'Georgescu', 'Stanescu', 'Dimitrescu',
  'Mensah', 'Owusu', 'Boateng', 'Asante', 'Agyeman',
];

/**
 * Genera una fecha de nacimiento aleatoria
 * Rango: 18-75 años (para IRPF, interesa población activa/jubilada)
 */
function randomBirthDate() {
  const today = new Date();
  const minAge = 18;
  const maxAge = 75;
  const ageYears = Math.floor(Math.random() * (maxAge - minAge + 1)) + minAge;
  const birthDate = new Date(today.getFullYear() - ageYears, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
  return birthDate.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Selecciona aleatoriamente de un array
 */
function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Crea un person con datos demográficos
 */
function createPerson() {
  const nombre = randomElement(NOMBRES);
  const apellidos = randomElement(APELLIDOS);
  
  return {
    nombre,
    apellidos,
    fecha_nacimiento: randomBirthDate(),
    genero: randomElement(GENEROS),
    pais_origen: randomElement(PAISES_ORIGEN),
    idioma_principal: 'es',
    nivel_estudios: randomElement(NIVELES_ESTUDIOS),
    situacion_laboral: randomElement(SITUACIONES_LABORALES),
    nivel_ingresos: randomElement(['sin_ingresos', 'menos_500', 'entre_500_1000', 'entre_1000_1500', 'mas_1500']),
    tipo_documento: randomElement(['DNI', 'NIE', 'Pasaporte', 'Sin_Documentacion', 'Documento_Extranjero']),
    numero_documento: `${Math.random().toString(36).substring(7).toUpperCase().padEnd(10, '0')}`,
    telefono: `+34${Math.floor(Math.random() * 900000000 + 100000000)}`,
    email: `test${Math.random().toString(36).substring(7)}@example.com`,
    empadronado: Math.random() > 0.3, // 70% empadronados
    fase_itinerario: randomElement(['acogida', 'estabilizacion', 'formacion', 'insercion_laboral', 'autonomia']),
  };
}

/**
 * Crea una familia de prueba
 */
function createFamily() {
  return {
    estado: 'activa',
    fecha_alta: new Date(new Date().getFullYear(), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
    num_miembros: 1,
    num_adultos: 1,
    num_menores_18: 0,
  };
}

/**
 * Main seed function
 */
async function seed() {
  console.log('🌱 Starting IRPF demographic seed...');
  
  try {
    // 1. Crear 1 familia de prueba
    console.log('\n📝 Creating test family...');
    const { data: familyData, error: familyError } = await supabase
      .from('families')
      .insert([createFamily()])
      .select('id');
    
    if (familyError) throw new Error(`Family creation failed: ${familyError.message}`);
    const familyId = familyData[0].id;
    console.log(`✅ Family created: ${familyId}`);
    
    // 2. Crear 100 personas con datos demográficos variados
    console.log('\n👥 Creating 100 persons with demographic data...');
    const persons = Array.from({ length: 100 }, () => createPerson());
    
    const { data: personData, error: personError } = await supabase
      .from('persons')
      .insert(persons)
      .select('id');
    
    if (personError) throw new Error(`Person creation failed: ${personError.message}`);
    console.log(`✅ ${personData.length} persons created`);
    
    // 3. Crear familia_miembros (vincular personas a la familia)
    console.log('\n🔗 Creating familia_miembros relationships...');
    const familiaMiembros = personData.map((person, index) => ({
      familia_id: familyId,
      person_id: person.id,
      nombre: persons[index].nombre,
      apellidos: persons[index].apellidos,
      rol: 'dependent', // Usar solo 'dependent' por defecto
      relacion: randomElement(['parent', 'child', 'sibling', 'other']),
      estado: 'activo',
      fecha_nacimiento: persons[index].fecha_nacimiento,
    }));
    
    const { data: familiaMiembrosData, error: familiaMiembrosError } = await supabase
      .from('familia_miembros')
      .insert(familiaMiembros)
      .select('id');
    
    if (familiaMiembrosError) throw new Error(`familia_miembros creation failed: ${familiaMiembrosError.message}`);
    console.log(`✅ ${familiaMiembrosData.length} familia_miembros created`);
    
    // 4. Verificar datos insertados
    console.log('\n📊 Verifying inserted data...');
    const { data: familyCount } = await supabase
      .from('families')
      .select('id', { count: 'exact' });
    
    const { data: personCount } = await supabase
      .from('persons')
      .select('id', { count: 'exact' });
    
    const { data: familiaMiembrosCount } = await supabase
      .from('familia_miembros')
      .select('id', { count: 'exact' });
    
    console.log(`\n✅ Seed complete!`);
    console.log(`   Families: ${familyCount?.length || 0}`);
    console.log(`   Persons: ${personCount?.length || 0}`);
    console.log(`   Familia_miembros: ${familiaMiembrosCount?.length || 0}`);
    
    // 5. Mostrar distribución demográfica
    console.log('\n📈 Demographic distribution sample:');
    const { data: samplePersons } = await supabase
      .from('persons')
      .select('genero, nivel_estudios, situacion_laboral, pais_origen')
      .limit(10);
    
    if (samplePersons) {
      console.log('   Sample persons:');
      samplePersons.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.genero} | ${p.nivel_estudios} | ${p.situacion_laboral} | ${p.pais_origen}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
}

seed();
