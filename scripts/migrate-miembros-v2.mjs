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

// Split SQL into individual statements
const statements = migrationSql
  .split(';')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'));

console.log(`Found ${statements.length} SQL statements to execute\n`);

// Execute migration
(async () => {
  try {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      console.log(`[${i + 1}/${statements.length}] Executing: ${stmt.substring(0, 60)}...`);
      
      const { data, error } = await supabase.from('families').select('id').limit(1).then(() => ({data: null, error: null}));
      
      // For now, just log that we're attempting
      console.log(`  ✓ Ready to execute`);
    }
    
    console.log('\n✅ All statements ready!');
    console.log('\n⚠️  Note: Direct SQL execution requires Supabase admin API');
    console.log('Please execute the migration manually in Supabase dashboard or use admin API');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
