import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { PersonCreate } from "../schemas";

export function useCreatePerson() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ data }: { data: PersonCreate }) => {
      // Destructure program_ids out — handled separately via useEnrollPerson
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { program_ids: _, ...personData } = data;

      // Build the insert payload aligned to DB column names
      // Omit 'id' — DB generates UUID via gen_random_uuid()
      const insertPayload = {
        nombre: personData.nombre,
        apellidos: personData.apellidos,
        fecha_nacimiento: personData.fecha_nacimiento,
        genero: personData.genero ?? null,
        pais_origen: personData.pais_origen ?? null,
        idioma_principal: personData.idioma_principal,
        idiomas: personData.idiomas ?? null,
        telefono: personData.telefono ?? null,
        email: personData.email === "" ? null : (personData.email ?? null),
        direccion: personData.direccion ?? null,
        municipio: personData.municipio ?? null,
        barrio_zona: personData.barrio_zona ?? null,
        tipo_documento: personData.tipo_documento ?? null,
        numero_documento: personData.numero_documento ?? null,
        situacion_legal: personData.situacion_legal ?? null,
        fecha_llegada_espana: personData.fecha_llegada_espana ?? null,
        tipo_vivienda: personData.tipo_vivienda ?? null,
        estabilidad_habitacional: personData.estabilidad_habitacional ?? null,
        empadronado: personData.empadronado ?? null,
        nivel_estudios: personData.nivel_estudios ?? null,
        situacion_laboral: personData.situacion_laboral ?? null,
        nivel_ingresos: personData.nivel_ingresos ?? null,
        canal_llegada: personData.canal_llegada,
        entidad_derivadora: personData.entidad_derivadora ?? null,
        persona_referencia: personData.persona_referencia ?? null,
        recorrido_migratorio: personData.recorrido_migratorio ?? null,
        necesidades_principales: personData.necesidades_principales ?? null,
        restricciones_alimentarias: personData.restricciones_alimentarias ?? null,
        observaciones: personData.observaciones ?? null,
        notas_privadas: personData.notas_privadas ?? null,
        fase_itinerario: personData.fase_itinerario ?? undefined,
        foto_perfil_url: personData.foto_perfil_url ?? null,
        foto_documento_url: personData.foto_documento_url ?? null,
      };

      const { data: person, error } = await supabase
        .from("persons")
        .insert([insertPayload])
        .select("id, nombre, apellidos")
        .single();

      if (error) throw error;
      return person;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["persons"] });
    },
  });
}
