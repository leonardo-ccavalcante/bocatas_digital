#!/usr/bin/env node

/**
 * Migration script: Add published_at and expires_at columns to announcements table
 * Usage: node scripts/migrate-announcements.mjs
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  try {
    console.log("📋 Checking current announcements table schema...");

    // Check current columns
    const { data: columns, error: checkError } = await supabase.rpc(
      "get_table_columns",
      { table_name: "announcements" }
    );

    if (checkError) {
      console.log("⚠️  Could not use RPC, checking via query instead...");
      
      // Alternative: Try to insert a row with the new columns to see if they exist
      const { error: testError } = await supabase
        .from("announcements")
        .insert({
          titulo: "test",
          contenido: "test",
          tipo: "info",
          published_at: new Date().toISOString(),
          expires_at: new Date().toISOString(),
        })
        .select();

      if (testError && testError.message.includes("published_at")) {
        console.log("✅ Columns already exist or need to be added");
      }
    } else {
      console.log("Current columns:", columns);
    }

    // Step 1: Add published_at column if it doesn't exist
    console.log("\n📝 Adding published_at column...");
    const { error: addPublishedError } = await supabase.rpc("execute_sql", {
      query: `
        ALTER TABLE announcements
        ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
      `,
    });

    if (addPublishedError) {
      console.log("⚠️  published_at column might already exist:", addPublishedError.message);
    } else {
      console.log("✅ published_at column added");
    }

    // Step 2: Add expires_at column if it doesn't exist
    console.log("\n📝 Adding expires_at column...");
    const { error: addExpiresError } = await supabase.rpc("execute_sql", {
      query: `
        ALTER TABLE announcements
        ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
      `,
    });

    if (addExpiresError) {
      console.log("⚠️  expires_at column might already exist:", addExpiresError.message);
    } else {
      console.log("✅ expires_at column added");
    }

    // Step 3: Verify columns exist
    console.log("\n✅ Verifying columns...");
    const { data: verifyData, error: verifyError } = await supabase
      .from("announcements")
      .select("id, published_at, expires_at")
      .limit(1);

    if (verifyError) {
      console.log("❌ Verification failed:", verifyError.message);
      process.exit(1);
    } else {
      console.log("✅ Columns verified successfully!");
      console.log("Sample row structure:", verifyData?.[0] || "No rows yet");
    }

    console.log("\n✅ Migration complete!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

main();
