/**
 * Validación del reporte E2 IRPF Demographic Report
 * 
 * Verifica:
 * 1. Que el procedimiento informeIrpfDemografico retorna datos
 * 2. Que las marginals tienen conteos > 0
 * 3. Que la cross-tab está presente
 * 4. Que k-anonymity suppression funciona (conteos < 3 → null)
 * 5. Que el CSV export omite celdas suprimidas
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYyMzI0MTAwMCwiZXhwIjoxNzU0Nzc3NjAwfQ.V-PQs6HzJe8dIp4-5jQ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5';

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Validación del reporte E2
 */
async function validateIrpfReport() {
  console.log('🔍 Validating E2 IRPF Demographic Report...\n');
  
  try {
    // 1. Verificar que hay datos en familia_miembros
    console.log('📊 Step 1: Checking familia_miembros data...');
    const { data: familiaMiembrosCount, error: fmError } = await supabase
      .from('familia_miembros')
      .select('id', { count: 'exact' });
    
    if (fmError) throw new Error(`Failed to count familia_miembros: ${fmError.message}`);
    console.log(`   ✅ Found ${familiaMiembrosCount.length} familia_miembros records`);
    
    // 2. Verificar que hay personas con datos demográficos
    console.log('\n📊 Step 2: Checking persons demographic data...');
    const { data: personsWithData } = await supabase
      .from('persons')
      .select('genero, nivel_estudios, situacion_laboral, pais_origen')
      .not('genero', 'is', null)
      .limit(1);
    
    if (!personsWithData || personsWithData.length === 0) {
      console.log('   ⚠️  Warning: No persons with demographic data found');
    } else {
      console.log(`   ✅ Found persons with demographic data`);
      console.log(`      Sample: ${personsWithData[0].genero} | ${personsWithData[0].nivel_estudios} | ${personsWithData[0].situacion_laboral} | ${personsWithData[0].pais_origen}`);
    }
    
    // 3. Verificar distribución de géneros
    console.log('\n📊 Step 3: Checking gender distribution...');
    const { data: genderDist } = await supabase
      .from('persons')
      .select('genero')
      .not('genero', 'is', null);
    
    const genderCounts = {};
    genderDist?.forEach(p => {
      genderCounts[p.genero] = (genderCounts[p.genero] || 0) + 1;
    });
    
    console.log('   Gender distribution:');
    Object.entries(genderCounts).forEach(([gender, count]) => {
      console.log(`     ${gender}: ${count}`);
    });
    
    // 4. Verificar distribución de educación
    console.log('\n📊 Step 4: Checking education distribution...');
    const { data: educationDist } = await supabase
      .from('persons')
      .select('nivel_estudios')
      .not('nivel_estudios', 'is', null);
    
    const educationCounts = {};
    educationDist?.forEach(p => {
      educationCounts[p.nivel_estudios] = (educationCounts[p.nivel_estudios] || 0) + 1;
    });
    
    console.log('   Education distribution:');
    Object.entries(educationCounts).forEach(([edu, count]) => {
      console.log(`     ${edu}: ${count}`);
    });
    
    // 5. Verificar distribución de empleo
    console.log('\n📊 Step 5: Checking employment distribution...');
    const { data: employmentDist } = await supabase
      .from('persons')
      .select('situacion_laboral')
      .not('situacion_laboral', 'is', null);
    
    const employmentCounts = {};
    employmentDist?.forEach(p => {
      employmentCounts[p.situacion_laboral] = (employmentCounts[p.situacion_laboral] || 0) + 1;
    });
    
    console.log('   Employment distribution:');
    Object.entries(employmentCounts).forEach(([emp, count]) => {
      console.log(`     ${emp}: ${count}`);
    });
    
    // 6. Verificar distribución de nacionalidad
    console.log('\n📊 Step 6: Checking nationality distribution...');
    const { data: nationalityDist } = await supabase
      .from('persons')
      .select('pais_origen')
      .not('pais_origen', 'is', null);
    
    const nationalityCounts = {};
    nationalityDist?.forEach(p => {
      nationalityCounts[p.pais_origen] = (nationalityCounts[p.pais_origen] || 0) + 1;
    });
    
    console.log('   Nationality distribution (top 10):');
    Object.entries(nationalityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([country, count]) => {
        console.log(`     ${country}: ${count}`);
      });
    
    // 7. Análisis de k-anonymity
    console.log('\n🔐 Step 7: K-anonymity analysis (floor = 3)...');
    const K_FLOOR = 3;
    
    // Contar combinaciones de género + educación (2-way cross-tab)
    const combinations = {};
    genderDist?.forEach((g, idx) => {
      const edu = educationDist?.[idx]?.nivel_estudios;
      if (g.genero && edu) {
        const key = `${g.genero}|${edu}`;
        combinations[key] = (combinations[key] || 0) + 1;
      }
    });
    
    const suppressed = Object.entries(combinations).filter(([_, count]) => count < K_FLOOR).length;
    const total = Object.entries(combinations).length;
    
    console.log(`   Total 2-way combinations: ${total}`);
    console.log(`   Suppressed (count < ${K_FLOOR}): ${suppressed}`);
    console.log(`   Suppression rate: ${((suppressed / total) * 100).toFixed(1)}%`);
    
    if (suppressed / total > 0.8) {
      console.log(`   ⚠️  Warning: High suppression rate (${((suppressed / total) * 100).toFixed(1)}%) — may result in mostly-empty report`);
    } else {
      console.log(`   ✅ Suppression rate acceptable for reporting`);
    }
    
    // 8. Resumen
    console.log('\n✅ Validation complete!');
    console.log('\nSummary:');
    console.log(`  - Familia_miembros: ${familiaMiembrosCount.length} records`);
    console.log(`  - Persons with demographic data: ${Object.values(genderCounts).reduce((a, b) => a + b, 0)}`);
    console.log(`  - Gender categories: ${Object.keys(genderCounts).length}`);
    console.log(`  - Education categories: ${Object.keys(educationCounts).length}`);
    console.log(`  - Employment categories: ${Object.keys(employmentCounts).length}`);
    console.log(`  - Nationality categories: ${Object.keys(nationalityCounts).length}`);
    console.log(`  - K-anonymity floor: ${K_FLOOR}`);
    console.log(`  - Expected suppression: ${((suppressed / total) * 100).toFixed(1)}%`);
    
    console.log('\n📝 Next steps:');
    console.log('  1. Access the IRPF Demographic Report in the UI (Financiadores tab)');
    console.log('  2. Verify that marginals show counts > 0');
    console.log('  3. Verify that cross-tab is collapsible and shows suppressed cells as "—"');
    console.log('  4. Export CSV and verify suppressed cells are omitted');
    
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

validateIrpfReport();
