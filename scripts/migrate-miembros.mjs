import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('❌ Error: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

console.log('🔄 Connecting to Supabase...');
const supabase = createClient(url, key);

// Read migration SQL
const migrationPath = path.join(__dirname, '../supabase/migrations/20260505_migrate_miembros_to_table.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

console.log('📝 Migration SQL loaded');
console.log('🚀 Executing migration...\n');

// Execute migration
(async () => {
  try {
    const { data, error } = await supabase.rpc('execute_sql', { query: migrationSql });
    
    if (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
    
    console.log('✅ Migration executed successfully!');
    console.log('Response:', data);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
