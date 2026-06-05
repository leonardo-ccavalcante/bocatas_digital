import { describe } from "vitest";

interface RealSupabaseOptions {
  requireJwtSecret?: boolean;
}

type DescribeLike = (name: string, fn: () => void) => void;

function firstEnv(...names: string[]): string | undefined {
  return names.map((name) => process.env[name]).find(Boolean);
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value === "ph_only" || value === "ph.ph.ph";
}

function isLocalUrl(value: string | undefined): boolean {
  if (!value) return true;

  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return true;
  }
}

export function hasRealSupabaseEnv(options: RealSupabaseOptions = {}): boolean {
  const url = firstEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = firstEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  const allowLocal = process.env.RUN_LOCAL_SUPABASE_TESTS === "true";

  if (isPlaceholder(serviceKey) || isPlaceholder(anonKey)) return false;
  if (!url || (!allowLocal && isLocalUrl(url))) return false;
  if (options.requireJwtSecret && isPlaceholder(process.env.SUPABASE_JWT_SECRET)) {
    return false;
  }

  return true;
}

export function getRealSupabaseDescribe(options: RealSupabaseOptions = {}): DescribeLike {
  return (hasRealSupabaseEnv(options) ? describe : describe.skip) as DescribeLike;
}
