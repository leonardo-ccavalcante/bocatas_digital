/**
 * DDL migration for Batch 20 via Supabase postgres direct connection
 */
import pg from 'pg';

const { Client } = pg;

// Construct postgres URL from Supabase project ref
// Format: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
const projectRef = 'vqvgcsdvvgyubqxumlwn';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

// Try to use the Supabase postgres connection
// The password for the postgres user is typically the service role key or a separate DB password
// We'll use the Supabase REST API's /query endpoint instead

const supabaseUrl = process.env.SUPABASE_URL;

async function runDDL() {
  console.log('Running DDL migrations via Supabase...');
  
  const ddlStatements = [
    `ALTER TABLE derivacion_intervenciones ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ`,
    `ALTER TABLE derivacion_intervenciones ADD COLUMN IF NOT EXISTS excluded_by TEXT`,
    `ALTER TABLE derivacion_intervenciones ADD COLUMN IF NOT EXISTS excluded_reason TEXT`,
    `ALTER TABLE derivacion_hojas ADD COLUMN IF NOT EXISTS firmado_url TEXT`,
    `ALTER TABLE derivacion_hojas ADD COLUMN IF NOT EXISTS firmado_at TIMESTAMPTZ`,
  ];

  // Use Supabase's pg REST endpoint
  for (const sql of ddlStatements) {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.log(`Statement: ${sql}`);
      console.log(`Response: ${response.status} ${text.substring(0, 200)}`);
    }
  }

  // Try using the pg module with the Supabase postgres URL
  // The connection string format for Supabase is:
  // postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
  // But we don't have the DB password directly
  
  // Alternative: use the Supabase client's from() with a raw query via a stored procedure
  // Let's create a temporary function to run DDL
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(supabaseUrl, serviceKey);
  
  // Try to create a helper function first
  // Actually, let's check if we can use the pg schema directly
  const { data: pgData, error: pgError } = await db.schema('extensions').rpc('pg_execute', {});
  console.log('pg schema test:', JSON.stringify({ pgData, pgError: pgError?.message }));
  
  // Check column existence
  const { error: checkErr } = await db.from('derivacion_intervenciones').select('excluded_at').limit(1);
  if (checkErr?.code === '42703') {
    console.log('excluded_at column does not exist yet - DDL needed');
    console.log('\nPlease run this SQL in the Supabase Dashboard SQL editor:');
    console.log(`
ALTER TABLE derivacion_intervenciones
  ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluded_by TEXT,
  ADD COLUMN IF NOT EXISTS excluded_reason TEXT;

ALTER TABLE derivacion_hojas
  ADD COLUMN IF NOT EXISTS firmado_url TEXT,
  ADD COLUMN IF NOT EXISTS firmado_at TIMESTAMPTZ;
    `);
  } else {
    console.log('Columns already exist or accessible');
  }
}

runDDL().catch(e => {
  console.error('DDL failed:', e.message);
  process.exit(1);
});
