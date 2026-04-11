/**
 * useConsentTemplates — tRPC-based consent templates hook.
 *
 * Previously used the Supabase browser client directly.
 * Now delegates to the tRPC server procedure that uses createAdminClient()
 * to ensure templates are always visible regardless of auth state.
 */
import { trpc } from "@/lib/trpc";
import type { ConsentTemplate } from "../schemas";

export function useConsentTemplates(idioma: "es" | "ar" | "fr" | "bm" = "es") {
  return trpc.persons.consentTemplates.useQuery(
    { idioma },
    { staleTime: 5 * 60_000 }
  );
}

export function useAllConsentTemplates() {
  // For admin use — fetch all languages by running multiple queries
  const es = trpc.persons.consentTemplates.useQuery({ idioma: "es" }, { staleTime: 5 * 60_000 });
  const ar = trpc.persons.consentTemplates.useQuery({ idioma: "ar" }, { staleTime: 5 * 60_000 });
  const fr = trpc.persons.consentTemplates.useQuery({ idioma: "fr" }, { staleTime: 5 * 60_000 });
  const bm = trpc.persons.consentTemplates.useQuery({ idioma: "bm" }, { staleTime: 5 * 60_000 });

  const allData: ConsentTemplate[] = [
    ...(es.data ?? []),
    ...(ar.data ?? []),
    ...(fr.data ?? []),
    ...(bm.data ?? []),
  ];

  return {
    data: allData,
    isLoading: es.isLoading || ar.isLoading || fr.isLoading || bm.isLoading,
    isError: es.isError || ar.isError || fr.isError || bm.isError,
  };
}
