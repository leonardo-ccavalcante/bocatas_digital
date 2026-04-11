import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../database.types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[Bocatas] Missing Supabase env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set."
  );
}

// Singleton to avoid creating multiple GoTrueClient instances
let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (!_client) {
    _client = createBrowserClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  }
  return _client;
}
