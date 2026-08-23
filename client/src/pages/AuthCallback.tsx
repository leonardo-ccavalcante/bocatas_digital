import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * OAuth return handler (Google) — client-side by necessity.
 *
 * The Supabase client uses the PKCE flow, so the code→session exchange MUST happen
 * in the browser: the one-time `code_verifier` lives in this origin's localStorage,
 * never on the server. The Express server therefore does NOT intercept /auth/callback
 * (see server/_core/oauth.ts) — if it did, it would attempt an exchange without the
 * verifier and OAuth login would always fail with `?error=auth_failed`. This page
 * lets `detectSessionInUrl` (client/src/lib/supabase/client.ts) finish the exchange,
 * the same path the magic-link flow already relies on.
 */
export function getSafeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  return value;
}

export default function AuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const providerError = params.get("error_description") ?? params.get("error");
    if (providerError) {
      setError(providerError);
      return;
    }
    const next = getSafeNext(params.get("next"));
    const supabase = createClient();
    let settled = false;
    const goNext = () => {
      if (settled) return;
      settled = true;
      window.location.href = next;
    };

    // detectSessionInUrl auto-exchanges the ?code= (PKCE) or #access_token (magic
    // link) using this browser's stored verifier. Catch the session two ways to
    // avoid a race between the exchange completing and the listener attaching.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) goNext();
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) goNext();
    });

    const timeout = setTimeout(() => {
      if (!settled) {
        setError("No se pudo completar el inicio de sesión. Inténtalo de nuevo.");
      }
    }, 15000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 p-4">
        <div className="w-full max-w-md rounded-lg bg-card shadow-xl p-6 text-center space-y-4">
          <p className="text-sm text-destructive">{error}</p>
          <a href="/login" className="inline-block text-sm text-amber-700 underline">
            Volver al inicio de sesión
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100">
      <Loader2 className="h-8 w-8 animate-spin text-amber-600" aria-label="Iniciando sesión..." />
    </div>
  );
}
