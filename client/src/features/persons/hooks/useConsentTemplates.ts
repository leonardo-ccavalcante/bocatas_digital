import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { ConsentTemplateSchema, type ConsentTemplate } from "../schemas";
import { z } from "zod";

export function useConsentTemplates(idioma: "es" | "ar" | "fr" | "bm" = "es") {
  const supabase = createClient();

  return useQuery<ConsentTemplate[]>({
    queryKey: ["consent_templates", idioma],
    staleTime: 5 * 60_000, // 5 min — templates change rarely
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consent_templates")
        .select("id, purpose, idioma, version, text_content, is_active, updated_at")
        .eq("idioma", idioma)
        .eq("is_active", true)
        .order("purpose");

      if (error) throw error;
      return z.array(ConsentTemplateSchema).parse(data ?? []);
    },
  });
}

export function useAllConsentTemplates() {
  const supabase = createClient();

  return useQuery<ConsentTemplate[]>({
    queryKey: ["consent_templates", "all"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consent_templates")
        .select("id, purpose, idioma, version, text_content, is_active, updated_at")
        .order("purpose")
        .order("idioma");

      if (error) throw error;
      return z.array(ConsentTemplateSchema).parse(data ?? []);
    },
  });
}
