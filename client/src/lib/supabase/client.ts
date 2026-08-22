import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[Bocatas] Missing Supabase env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set."
  );
}

// Singleton — uses localStorage for session persistence (survives page reloads)
let _client: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createClient() {
  if (!_client) {
    _client = createSupabaseClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: true,
        storageKey: "bocatas-auth",
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _client;
}
