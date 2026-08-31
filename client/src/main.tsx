// i18n NO se importa aquí. Este import de efecto lateral metía i18next,
// react-i18next, i18next-browser-languagedetector y los DOCE JSON de locales en
// el chunk de entrada — o sea, en cada carga de /login — para servir a un único
// componente, LanguageSwitcher, que no está referenciado en ninguna parte.
//
// La UI es sólo en español (AGENTS.md); el único texto no español es el del
// modal de consentimiento, y ese viene de `consent_templates` en la base, no de
// i18next. Los archivos se quedan en el repo para cuando la UI multiidioma se
// construya de verdad: entonces hay que volver a importar `@/lib/i18n` ANTES de
// montar el primer componente que use `useTranslation`, o el hook fallará en
// tiempo de ejecución porque nadie habrá llamado a init().
import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { createClient } from "@/lib/supabase/client";
import { PostHogProvider } from "./lib/posthog";
import { registerSwUpdateToast } from "./lib/swUpdate";
import "./index.css";

// ATL-07: default staleTime so window-focus/tab-switch does NOT refire every
// visible query (the admin Personas list alone re-fetched the full persons
// dataset on each focus, on 4G). Mutations still invalidate + refetch
// immediately; Supabase Realtime (dashboard counters) is push-driven and
// unaffected. Per-query overrides remain possible where freshness matters.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000 } },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const headers = new Headers((init as RequestInit)?.headers);
        if (session?.access_token) {
          headers.set("Authorization", `Bearer ${session.access_token}`);
        }
        return globalThis.fetch(input, {
          ...(init ?? {}),
          headers,
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <PostHogProvider>
        <App />
      </PostHogProvider>
    </QueryClientProvider>
  </trpc.Provider>
);

void registerSwUpdateToast();
