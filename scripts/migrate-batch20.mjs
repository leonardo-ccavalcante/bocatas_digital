/**
 * Batch 20 migration script
 * Adds excluded_at/excluded_by/excluded_reason to derivacion_intervenciones
 * Adds firmado_url/firmado_at to derivacion_hojas
 * Seeds app_settings for template activation and secondary logo
 * Creates derivaciones-firmadas storage bucket
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('Running Batch 20 migrations...');

  // 1. Check if columns already exist by trying to select them
  const { error: checkExcluded } = await db
    .from('derivacion_intervenciones')
    .select('excluded_at')
    .limit(1);
  
  if (checkExcluded && checkExcluded.code === '42703') {
    console.log('Need to add excluded_at columns - using pg directly...');
    // Use the Supabase postgres REST endpoint for DDL
    const pgUrl = SUPABASE_URL.replace('https://', 'https://') + '/rest/v1/rpc/exec_ddl';
    console.log('Note: Cannot run DDL via REST API directly. Will use alternative approach.');
  } else {
    console.log('excluded_at column already exists or accessible');
  }

  // 2. Seed app_settings
  const { error: settingsErr } = await db.from('app_settings').upsert([
    {
      key: 'derivar_active_template',
      value: 'derivacion_hoja_template_v3.docx',
      description: 'Nombre del archivo DOCX activo para hojas de derivación'
    },
    {
      key: 'derivar_secondary_logo_key',
      value: '',
      description: 'Clave del logo secundario en Storage (program-document-templates)'
    }
  ], { onConflict: 'key', ignoreDuplicates: true });
  
  if (settingsErr) {
    console.error('app_settings error:', settingsErr);
  } else {
    console.log('✓ app_settings seeded');
  }

  // 3. Check if derivaciones-firmadas bucket exists
  const { data: buckets } = await db.storage.listBuckets();
  const hasBucket = buckets?.some(b => b.id === 'derivaciones-firmadas');
  
  if (!hasBucket) {
    const { error: bucketErr } = await db.storage.createBucket('derivaciones-firmadas', {
      public: false,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png']
    });
    if (bucketErr) {
      console.error('Bucket creation error:', bucketErr);
    } else {
      console.log('✓ derivaciones-firmadas bucket created');
    }
  } else {
    console.log('✓ derivaciones-firmadas bucket already exists');
  }

  // 4. Check current app_settings
  const { data: settings } = await db.from('app_settings').select('*');
  console.log('Current app_settings:', JSON.stringify(settings, null, 2));

  console.log('\nMigration complete. DDL changes (ALTER TABLE) must be run via Supabase Dashboard SQL editor:');
  console.log(`
ALTER TABLE derivacion_intervenciones
  ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluded_by TEXT,
  ADD COLUMN IF NOT EXISTS excluded_reason TEXT;

ALTER TABLE derivacion_hojas
  ADD COLUMN IF NOT EXISTS firmado_url TEXT,
  ADD COLUMN IF NOT EXISTS firmado_at TIMESTAMPTZ;
  `);
}

main().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
