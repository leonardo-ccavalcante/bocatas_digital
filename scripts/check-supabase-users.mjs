import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Check auth.users
const { data: authData, error: authErr } = await sb.auth.admin.listUsers({ perPage: 50 });
if (authErr) {
  console.log('auth.users ERROR:', authErr.message);
} else {
  console.log('auth.users count:', authData.users.length);
  authData.users.forEach(u => console.log(`  ${u.email} | ${u.id} | ${u.user_metadata?.name ?? ''}`));
}

console.log('\n--- Checking created_by columns ---');
const tables = ['programs', 'announcements', 'bulk_import_previews', 'delivery_rounds', 'family_follow_ups', 'derivacion_intervenciones'];
for (const t of tables) {
  const { data, error } = await sb.from(t).select('created_by').limit(3);
  if (error) {
    console.log(`  ${t}: ERROR ${error.message}`);
  } else if (data.length > 0) {
    console.log(`  ${t}.created_by samples:`, data.map(r => r.created_by));
  } else {
    console.log(`  ${t}: empty`);
  }
}
