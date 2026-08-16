/**
 * Migration script: Create Supabase Auth users for all existing MySQL users
 * and populate the app_users table in Supabase PostgreSQL.
 *
 * This script:
 * 1. Reads all users from MySQL (TiDB)
 * 2. Creates each user in Supabase Auth (auth.users)
 * 3. Inserts the corresponding row in public.app_users
 *
 * Safe to re-run: skips users whose email already exists in auth.users.
 */
import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/mysql2';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const mysql = drizzle(process.env.DATABASE_URL);

function toISO(val) {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  return new Date(val).toISOString();
}

// 1. Fetch all users from MySQL
const [rows] = await mysql.execute('SELECT id, openId, name, email, loginMethod, role, createdAt, lastSignedIn FROM users ORDER BY id');
console.log(`Found ${rows.length} users in MySQL.`);

let created = 0;
let skipped = 0;
let errors = 0;

for (const user of rows) {
  if (!user.email) {
    console.log(`  SKIP (no email): id=${user.id} name=${user.name}`);
    skipped++;
    continue;
  }

  // 2. Create in Supabase Auth
  const { data: authUser, error: authErr } = await sb.auth.admin.createUser({
    email: user.email,
    password: crypto.randomUUID(), // temporary — user resets via magic link
    email_confirm: true,
    user_metadata: {
      name: user.name,
      legacy_mysql_id: user.id,
      open_id: user.openId,
    }
  });

  if (authErr) {
    if (authErr.message?.includes('already been registered') || authErr.message?.includes('already exists')) {
      // User already exists in auth — look them up
      const { data: listData } = await sb.auth.admin.listUsers({ perPage: 1000 });
      const existing = listData?.users?.find(u => u.email === user.email);
      if (existing) {
        // Ensure app_users row exists
        const { error: upsertErr } = await sb.from('app_users').upsert({
          id: existing.id,
          legacy_mysql_id: user.id,
          open_id: user.openId,
          name: user.name,
          email: user.email,
          login_method: user.loginMethod,
          role: user.role || 'user',
          created_at: toISO(user.createdAt),
          last_signed_in: toISO(user.lastSignedIn),
        }, { onConflict: 'id' });
        if (upsertErr) {
          console.log(`  ERROR upserting app_users for ${user.email}: ${upsertErr.message}`);
          errors++;
        } else {
          console.log(`  EXISTS: ${user.email} → ${existing.id} (app_users synced)`);
          skipped++;
        }
      } else {
        console.log(`  SKIP (exists in auth but not found in list): ${user.email}`);
        skipped++;
      }
      continue;
    }
    console.log(`  ERROR creating auth user ${user.email}: ${authErr.message}`);
    errors++;
    continue;
  }

  // 3. Insert into app_users
  const { error: insertErr } = await sb.from('app_users').insert({
    id: authUser.user.id,
    legacy_mysql_id: user.id,
    open_id: user.openId,
    name: user.name,
    email: user.email,
    login_method: user.loginMethod,
    role: user.role || 'user',
    created_at: toISO(user.createdAt),
    last_signed_in: toISO(user.lastSignedIn),
  });

  if (insertErr) {
    console.log(`  ERROR inserting app_users for ${user.email}: ${insertErr.message}`);
    errors++;
  } else {
    console.log(`  CREATED: ${user.email} → ${authUser.user.id} (role: ${user.role})`);
    created++;
  }
}

console.log(`\nDone. Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`);
process.exit(errors > 0 ? 1 : 0);
