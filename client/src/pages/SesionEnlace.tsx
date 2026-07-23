/**
 * SesionEnlace.tsx — Public page at /s/:sessionId?t=<token>.
 *
 * Outside ProtectedRoute — no login required.
 * Reads token from the URL query string and passes it (via POST body) to
 * enlaceGetSession per GROUP 7e (token never in API query string, only page URL).
 *
 * Zero admin chrome. Mobile-first.
 */
import { useParams, useSearch } from "wouter";
import { EnlaceSessionView } from "@/features/programs/components/sessions/EnlaceSessionView";

export default function SesionEnlace() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const search = useSearch();
  // token is in the URL query string so the link is shareable.
  // It is sent in the POST body (not re-appended to API call) per GROUP 7e.
  const token = new URLSearchParams(search).get("t") ?? "";

  if (!sessionId) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 text-center">
        <p className="text-muted-foreground">ID de sesión no especificado en el enlace.</p>
      </main>
    );
  }

  return <EnlaceSessionView sessionId={sessionId} token={token} />;
}
