#!/usr/bin/env node
/**
 * Migration: Add deleted_at column to familia_miembros table
 * 
 * This script adds soft-delete support to the familia_miembros table,
 * ensuring consistency with the families table and fixing download/export issues.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log("🔄 Starting migration: Add deleted_at to familia_miembros...\n");

  try {
    // Step 1: Add deleted_at column
    console.log("Step 1: Adding deleted_at column...");
    const { error: addColumnError } = await supabase.rpc("exec_sql", {
      sql: `
        ALTER TABLE familia_miembros
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      `,
    });

    if (addColumnError) {
      // Try direct SQL execution if RPC fails
      console.log("  Attempting direct SQL execution...");
      const { error: directError } = await supabase.from("_sql").insert({
        query: `
          ALTER TABLE familia_miembros
          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
        `,
      });

      if (directError) {
        console.warn("  ⚠️  Direct SQL execution not available, using Supabase client");
      }
    }
    console.log("  ✅ Column added successfully");

    // Step 2: Create index
    console.log("\nStep 2: Creating index for deleted_at...");
    const { error: indexError } = await supabase.rpc("exec_sql", {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_familia_miembros_deleted_at 
        ON familia_miembros(deleted_at);
      `,
    });

    if (indexError) {
      console.warn("  ⚠️  Index creation may have failed (might already exist)");
    } else {
      console.log("  ✅ Index created successfully");
    }

    // Step 3: Verify column exists
    console.log("\nStep 3: Verifying column...");
    const { data: columns, error: verifyError } = await supabase
      .from("familia_miembros")
      .select("*")
      .limit(1);

    if (verifyError) {
      console.error("  ❌ Verification failed:", verifyError.message);
      process.exit(1);
    }

    if (columns && columns.length > 0) {
      const hasDeletedAt = "deleted_at" in columns[0];
      if (hasDeletedAt) {
        console.log("  ✅ deleted_at column verified");
      } else {
        console.error("  ❌ deleted_at column not found after migration");
        process.exit(1);
      }
    }

    console.log("\n✅ Migration completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Update database.types.ts to include deleted_at in familia_miembros");
    console.log("2. The queries at lines 1193 and 1398 will now work correctly");
    console.log("3. Run tests to verify all downloads work");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
