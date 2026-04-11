export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acompanamientos: {
        Row: {
          asignado_a: string | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          entidad_derivacion: string | null
          estado: string | null
          id: string
          metadata: Json | null
          person_id: string
          tipo: string | null
          updated_at: string
        }
        Insert: {
          asignado_a?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          entidad_derivacion?: string | null
          estado?: string | null
          id?: string
          metadata?: Json | null
          person_id: string
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          asignado_a?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          entidad_derivacion?: string | null
          estado?: string | null
          id?: string
          metadata?: Json | null
          person_id?: string
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "acompanamientos_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acompanamientos_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      attendances: {
        Row: {
          checked_in_at: string
          checked_in_date: string
          created_at: string
          deleted_at: string | null
          es_demo: boolean
          id: string
          location_id: string
          metadata: Json | null
          metodo: Database["public"]["Enums"]["metodo_checkin"]
          notas: string | null
          person_id: string | null
          programa: Database["public"]["Enums"]["programa"] | null
          registrado_por: string | null
          updated_at: string
        }
        Insert: {
          checked_in_at?: string
          checked_in_date?: string
          created_at?: string
          deleted_at?: string | null
          es_demo?: boolean
          id?: string
          location_id: string
          metadata?: Json | null
          metodo: Database["public"]["Enums"]["metodo_checkin"]
          notas?: string | null
          person_id?: string | null
          programa?: Database["public"]["Enums"]["programa"] | null
          registrado_por?: string | null
          updated_at?: string
        }
        Update: {
          checked_in_at?: string
          checked_in_date?: string
          created_at?: string
          deleted_at?: string | null
          es_demo?: boolean
          id?: string
          location_id?: string
          metadata?: Json | null
          metodo?: Database["public"]["Enums"]["metodo_checkin"]
          notas?: string | null
          person_id?: string | null
          programa?: Database["public"]["Enums"]["programa"] | null
          registrado_por?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          consent_text: string
          consent_version: string
          created_at: string
          deleted_at: string | null
          documento_url: string | null
          firma_url: string | null
          granted: boolean
          granted_at: string | null
          id: string
          idioma: Database["public"]["Enums"]["consent_language"]
          ip_address: unknown
          metadata: Json | null
          numero_serie_documento: string | null
          person_id: string
          purpose: Database["public"]["Enums"]["consent_purpose"]
          registrado_por: string | null
          revoked_at: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          consent_text: string
          consent_version: string
          created_at?: string
          deleted_at?: string | null
          documento_url?: string | null
          firma_url?: string | null
          granted: boolean
          granted_at?: string | null
          id?: string
          idioma: Database["public"]["Enums"]["consent_language"]
          ip_address?: unknown
          metadata?: Json | null
          numero_serie_documento?: string | null
          person_id: string
          purpose: Database["public"]["Enums"]["consent_purpose"]
          registrado_por?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          consent_text?: string
          consent_version?: string
          created_at?: string
          deleted_at?: string | null
          documento_url?: string | null
          firma_url?: string | null
          granted?: boolean
          granted_at?: string | null
          id?: string
          idioma?: Database["public"]["Enums"]["consent_language"]
          ip_address?: unknown
          metadata?: Json | null
          numero_serie_documento?: string | null
          person_id?: string
          purpose?: Database["public"]["Enums"]["consent_purpose"]
          registrado_por?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consents_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          cupo_maximo: number | null
          deleted_at: string | null
          descripcion: string | null
          estado: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          formador: string | null
          id: string
          location_id: string | null
          metadata: Json | null
          nombre: string
          tipo: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cupo_maximo?: number | null
          deleted_at?: string | null
          descripcion?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          formador?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json | null
          nombre: string
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cupo_maximo?: number | null
          deleted_at?: string | null
          descripcion?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          formador?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json | null
          nombre?: string
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          created_at: string
          deleted_at: string | null
          es_autorizado: boolean
          family_id: string
          fecha_entrega: string
          firma_url: string | null
          grant_id: string | null
          id: string
          kg_carne: number | null
          kg_frutas_hortalizas: number | null
          kg_infantil: number | null
          kg_otros: number | null
          kg_total: number | null
          metadata: Json | null
          notas: string | null
          recogido_por: string | null
          registrado_por: string | null
          unidades_no_alimenticias: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          es_autorizado?: boolean
          family_id: string
          fecha_entrega?: string
          firma_url?: string | null
          grant_id?: string | null
          id?: string
          kg_carne?: number | null
          kg_frutas_hortalizas?: number | null
          kg_infantil?: number | null
          kg_otros?: number | null
          kg_total?: number | null
          metadata?: Json | null
          notas?: string | null
          recogido_por?: string | null
          registrado_por?: string | null
          unidades_no_alimenticias?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          es_autorizado?: boolean
          family_id?: string
          fecha_entrega?: string
          firma_url?: string | null
          grant_id?: string | null
          id?: string
          kg_carne?: number | null
          kg_frutas_hortalizas?: number | null
          kg_infantil?: number | null
          kg_otros?: number | null
          kg_total?: number | null
          metadata?: Json | null
          notas?: string | null
          recogido_por?: string | null
          registrado_por?: string | null
          unidades_no_alimenticias?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          alta_en_guf: boolean | null
          autorizado: boolean | null
          consent_banco_alimentos: boolean | null
          consent_bocatas: boolean | null
          created_at: string
          deleted_at: string | null
          docs_identidad: boolean | null
          estado: string
          familia_numero: number
          fecha_alta: string
          fecha_alta_guf: string | null
          fecha_baja: string | null
          fecha_baja_guf: string | null
          id: string
          informe_social: boolean | null
          informe_social_fecha: string | null
          justificante_recibido: boolean | null
          metadata: Json | null
          miembros: Json | null
          motivo_baja: Database["public"]["Enums"]["motivo_baja_familia"] | null
          num_adultos: number | null
          num_menores_18: number | null
          num_miembros: number | null
          padron_recibido: boolean | null
          persona_recoge: string | null
          titular_id: string | null
          updated_at: string
        }
        Insert: {
          alta_en_guf?: boolean | null
          autorizado?: boolean | null
          consent_banco_alimentos?: boolean | null
          consent_bocatas?: boolean | null
          created_at?: string
          deleted_at?: string | null
          docs_identidad?: boolean | null
          estado?: string
          familia_numero?: number
          fecha_alta?: string
          fecha_alta_guf?: string | null
          fecha_baja?: string | null
          fecha_baja_guf?: string | null
          id?: string
          informe_social?: boolean | null
          informe_social_fecha?: string | null
          justificante_recibido?: boolean | null
          metadata?: Json | null
          miembros?: Json | null
          motivo_baja?:
            | Database["public"]["Enums"]["motivo_baja_familia"]
            | null
          num_adultos?: number | null
          num_menores_18?: number | null
          num_miembros?: number | null
          padron_recibido?: boolean | null
          persona_recoge?: string | null
          titular_id?: string | null
          updated_at?: string
        }
        Update: {
          alta_en_guf?: boolean | null
          autorizado?: boolean | null
          consent_banco_alimentos?: boolean | null
          consent_bocatas?: boolean | null
          created_at?: string
          deleted_at?: string | null
          docs_identidad?: boolean | null
          estado?: string
          familia_numero?: number
          fecha_alta?: string
          fecha_alta_guf?: string | null
          fecha_baja?: string | null
          fecha_baja_guf?: string | null
          id?: string
          informe_social?: boolean | null
          informe_social_fecha?: string | null
          justificante_recibido?: boolean | null
          metadata?: Json | null
          miembros?: Json | null
          motivo_baja?:
            | Database["public"]["Enums"]["motivo_baja_familia"]
            | null
          num_adultos?: number | null
          num_menores_18?: number | null
          num_miembros?: number | null
          padron_recibido?: boolean | null
          persona_recoge?: string | null
          titular_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "families_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "families_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "persons_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      grants: {
        Row: {
          created_at: string
          deleted_at: string | null
          estado: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          financiador: string
          id: string
          importe: number | null
          metadata: Json | null
          nombre: string
          programas_financiados: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          financiador: string
          id?: string
          importe?: number | null
          metadata?: Json | null
          nombre: string
          programas_financiados?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          financiador?: string
          id?: string
          importe?: number | null
          metadata?: Json | null
          nombre?: string
          programas_financiados?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          activo: boolean
          coordenadas: unknown
          created_at: string
          deleted_at: string | null
          direccion: string | null
          id: string
          metadata: Json | null
          nombre: string
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          coordenadas?: unknown
          created_at?: string
          deleted_at?: string | null
          direccion?: string | null
          id?: string
          metadata?: Json | null
          nombre: string
          tipo: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          coordenadas?: unknown
          created_at?: string
          deleted_at?: string | null
          direccion?: string | null
          id?: string
          metadata?: Json | null
          nombre?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      persons: {
        Row: {
          alertas_activas: Json | null
          apellidos: string | null
          barrio_zona: string | null
          canal_llegada: Database["public"]["Enums"]["canal_llegada"] | null
          created_at: string
          deleted_at: string | null
          direccion: string | null
          email: string | null
          empadronado: boolean | null
          empresa_empleo: string | null
          entidad_derivadora: string | null
          es_retorno: boolean | null
          estabilidad_habitacional:
            | Database["public"]["Enums"]["estabilidad_habitacional"]
            | null
          estado_empleo: string | null
          fase_itinerario: Database["public"]["Enums"]["fase_itinerario"]
          fecha_llegada_espana: string | null
          fecha_nacimiento: string | null
          foto_documento_url: string | null
          genero: Database["public"]["Enums"]["genero"] | null
          id: string
          idioma_principal: Database["public"]["Enums"]["idioma"]
          idiomas: Database["public"]["Enums"]["idioma"][] | null
          metadata: Json | null
          motivo_retorno: string | null
          municipio: string | null
          necesidades_principales: string | null
          nivel_estudios: Database["public"]["Enums"]["nivel_estudios"] | null
          nivel_ingresos: Database["public"]["Enums"]["nivel_ingresos"] | null
          nombre: string
          notas_privadas: string | null
          numero_documento: string | null
          observaciones: string | null
          pais_origen: string | null
          persona_referencia: string | null
          recorrido_migratorio: string | null
          situacion_laboral:
            | Database["public"]["Enums"]["situacion_laboral"]
            | null
          situacion_legal: string | null
          telefono: string | null
          tipo_documento: Database["public"]["Enums"]["tipo_documento"] | null
          tipo_vivienda: Database["public"]["Enums"]["tipo_vivienda"] | null
          updated_at: string
        }
        Insert: {
          alertas_activas?: Json | null
          apellidos?: string | null
          barrio_zona?: string | null
          canal_llegada?: Database["public"]["Enums"]["canal_llegada"] | null
          created_at?: string
          deleted_at?: string | null
          direccion?: string | null
          email?: string | null
          empadronado?: boolean | null
          empresa_empleo?: string | null
          entidad_derivadora?: string | null
          es_retorno?: boolean | null
          estabilidad_habitacional?:
            | Database["public"]["Enums"]["estabilidad_habitacional"]
            | null
          estado_empleo?: string | null
          fase_itinerario?: Database["public"]["Enums"]["fase_itinerario"]
          fecha_llegada_espana?: string | null
          fecha_nacimiento?: string | null
          foto_documento_url?: string | null
          genero?: Database["public"]["Enums"]["genero"] | null
          id?: string
          idioma_principal?: Database["public"]["Enums"]["idioma"]
          idiomas?: Database["public"]["Enums"]["idioma"][] | null
          metadata?: Json | null
          motivo_retorno?: string | null
          municipio?: string | null
          necesidades_principales?: string | null
          nivel_estudios?: Database["public"]["Enums"]["nivel_estudios"] | null
          nivel_ingresos?: Database["public"]["Enums"]["nivel_ingresos"] | null
          nombre: string
          notas_privadas?: string | null
          numero_documento?: string | null
          observaciones?: string | null
          pais_origen?: string | null
          persona_referencia?: string | null
          recorrido_migratorio?: string | null
          situacion_laboral?:
            | Database["public"]["Enums"]["situacion_laboral"]
            | null
          situacion_legal?: string | null
          telefono?: string | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento"] | null
          tipo_vivienda?: Database["public"]["Enums"]["tipo_vivienda"] | null
          updated_at?: string
        }
        Update: {
          alertas_activas?: Json | null
          apellidos?: string | null
          barrio_zona?: string | null
          canal_llegada?: Database["public"]["Enums"]["canal_llegada"] | null
          created_at?: string
          deleted_at?: string | null
          direccion?: string | null
          email?: string | null
          empadronado?: boolean | null
          empresa_empleo?: string | null
          entidad_derivadora?: string | null
          es_retorno?: boolean | null
          estabilidad_habitacional?:
            | Database["public"]["Enums"]["estabilidad_habitacional"]
            | null
          estado_empleo?: string | null
          fase_itinerario?: Database["public"]["Enums"]["fase_itinerario"]
          fecha_llegada_espana?: string | null
          fecha_nacimiento?: string | null
          foto_documento_url?: string | null
          genero?: Database["public"]["Enums"]["genero"] | null
          id?: string
          idioma_principal?: Database["public"]["Enums"]["idioma"]
          idiomas?: Database["public"]["Enums"]["idioma"][] | null
          metadata?: Json | null
          motivo_retorno?: string | null
          municipio?: string | null
          necesidades_principales?: string | null
          nivel_estudios?: Database["public"]["Enums"]["nivel_estudios"] | null
          nivel_ingresos?: Database["public"]["Enums"]["nivel_ingresos"] | null
          nombre?: string
          notas_privadas?: string | null
          numero_documento?: string | null
          observaciones?: string | null
          pais_origen?: string | null
          persona_referencia?: string | null
          recorrido_migratorio?: string | null
          situacion_laboral?:
            | Database["public"]["Enums"]["situacion_laboral"]
            | null
          situacion_legal?: string | null
          telefono?: string | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento"] | null
          tipo_vivienda?: Database["public"]["Enums"]["tipo_vivienda"] | null
          updated_at?: string
        }
        Relationships: []
      }
      program_enrollments: {
        Row: {
          course_id: string | null
          created_at: string
          deleted_at: string | null
          estado: Database["public"]["Enums"]["estado_enrollment"]
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          metadata: Json | null
          notas: string | null
          person_id: string
          programa: Database["public"]["Enums"]["programa"]
          updated_at: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          deleted_at?: string | null
          estado?: Database["public"]["Enums"]["estado_enrollment"]
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          metadata?: Json | null
          notas?: string | null
          person_id: string
          programa: Database["public"]["Enums"]["programa"]
          updated_at?: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          deleted_at?: string | null
          estado?: Database["public"]["Enums"]["estado_enrollment"]
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          metadata?: Json | null
          notas?: string | null
          person_id?: string
          programa?: Database["public"]["Enums"]["programa"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_enrollment_course"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_enrollments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_enrollments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteers: {
        Row: {
          activo: boolean
          created_at: string
          deleted_at: string | null
          disponibilidad: Json | null
          fecha_alta: string
          fecha_baja: string | null
          habilidades: string[] | null
          id: string
          metadata: Json | null
          person_id: string
          seguro_caducidad: string | null
          seguro_numero: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          deleted_at?: string | null
          disponibilidad?: Json | null
          fecha_alta?: string
          fecha_baja?: string | null
          habilidades?: string[] | null
          id?: string
          metadata?: Json | null
          person_id: string
          seguro_caducidad?: string | null
          seguro_numero?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          deleted_at?: string | null
          disponibilidad?: Json | null
          fecha_alta?: string
          fecha_baja?: string | null
          habilidades?: string[] | null
          id?: string
          metadata?: Json | null
          person_id?: string
          seguro_caducidad?: string | null
          seguro_numero?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "volunteers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "persons_safe"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      persons_safe: {
        Row: {
          alertas_activas: Json | null
          apellidos: string | null
          barrio_zona: string | null
          canal_llegada: Database["public"]["Enums"]["canal_llegada"] | null
          created_at: string | null
          deleted_at: string | null
          direccion: string | null
          email: string | null
          empadronado: boolean | null
          empresa_empleo: string | null
          entidad_derivadora: string | null
          es_retorno: boolean | null
          estabilidad_habitacional:
            | Database["public"]["Enums"]["estabilidad_habitacional"]
            | null
          estado_empleo: string | null
          fase_itinerario: Database["public"]["Enums"]["fase_itinerario"] | null
          fecha_llegada_espana: string | null
          fecha_nacimiento: string | null
          genero: Database["public"]["Enums"]["genero"] | null
          id: string | null
          idioma_principal: Database["public"]["Enums"]["idioma"] | null
          idiomas: Database["public"]["Enums"]["idioma"][] | null
          metadata: Json | null
          motivo_retorno: string | null
          municipio: string | null
          necesidades_principales: string | null
          nivel_estudios: Database["public"]["Enums"]["nivel_estudios"] | null
          nivel_ingresos: Database["public"]["Enums"]["nivel_ingresos"] | null
          nombre: string | null
          numero_documento: string | null
          observaciones: string | null
          pais_origen: string | null
          persona_referencia: string | null
          situacion_laboral:
            | Database["public"]["Enums"]["situacion_laboral"]
            | null
          telefono: string | null
          tipo_documento: Database["public"]["Enums"]["tipo_documento"] | null
          tipo_vivienda: Database["public"]["Enums"]["tipo_vivienda"] | null
          updated_at: string | null
        }
        Insert: {
          alertas_activas?: Json | null
          apellidos?: string | null
          barrio_zona?: string | null
          canal_llegada?: Database["public"]["Enums"]["canal_llegada"] | null
          created_at?: string | null
          deleted_at?: string | null
          direccion?: string | null
          email?: string | null
          empadronado?: boolean | null
          empresa_empleo?: string | null
          entidad_derivadora?: string | null
          es_retorno?: boolean | null
          estabilidad_habitacional?:
            | Database["public"]["Enums"]["estabilidad_habitacional"]
            | null
          estado_empleo?: string | null
          fase_itinerario?:
            | Database["public"]["Enums"]["fase_itinerario"]
            | null
          fecha_llegada_espana?: string | null
          fecha_nacimiento?: string | null
          genero?: Database["public"]["Enums"]["genero"] | null
          id?: string | null
          idioma_principal?: Database["public"]["Enums"]["idioma"] | null
          idiomas?: Database["public"]["Enums"]["idioma"][] | null
          metadata?: Json | null
          motivo_retorno?: string | null
          municipio?: string | null
          necesidades_principales?: string | null
          nivel_estudios?: Database["public"]["Enums"]["nivel_estudios"] | null
          nivel_ingresos?: Database["public"]["Enums"]["nivel_ingresos"] | null
          nombre?: string | null
          numero_documento?: string | null
          observaciones?: string | null
          pais_origen?: string | null
          persona_referencia?: string | null
          situacion_laboral?:
            | Database["public"]["Enums"]["situacion_laboral"]
            | null
          telefono?: string | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento"] | null
          tipo_vivienda?: Database["public"]["Enums"]["tipo_vivienda"] | null
          updated_at?: string | null
        }
        Update: {
          alertas_activas?: Json | null
          apellidos?: string | null
          barrio_zona?: string | null
          canal_llegada?: Database["public"]["Enums"]["canal_llegada"] | null
          created_at?: string | null
          deleted_at?: string | null
          direccion?: string | null
          email?: string | null
          empadronado?: boolean | null
          empresa_empleo?: string | null
          entidad_derivadora?: string | null
          es_retorno?: boolean | null
          estabilidad_habitacional?:
            | Database["public"]["Enums"]["estabilidad_habitacional"]
            | null
          estado_empleo?: string | null
          fase_itinerario?:
            | Database["public"]["Enums"]["fase_itinerario"]
            | null
          fecha_llegada_espana?: string | null
          fecha_nacimiento?: string | null
          genero?: Database["public"]["Enums"]["genero"] | null
          id?: string | null
          idioma_principal?: Database["public"]["Enums"]["idioma"] | null
          idiomas?: Database["public"]["Enums"]["idioma"][] | null
          metadata?: Json | null
          motivo_retorno?: string | null
          municipio?: string | null
          necesidades_principales?: string | null
          nivel_estudios?: Database["public"]["Enums"]["nivel_estudios"] | null
          nivel_ingresos?: Database["public"]["Enums"]["nivel_ingresos"] | null
          nombre?: string | null
          numero_documento?: string | null
          observaciones?: string | null
          pais_origen?: string | null
          persona_referencia?: string | null
          situacion_laboral?:
            | Database["public"]["Enums"]["situacion_laboral"]
            | null
          telefono?: string | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento"] | null
          tipo_vivienda?: Database["public"]["Enums"]["tipo_vivienda"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_person_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      canal_llegada:
        | "boca_a_boca"
        | "cruz_roja"
        | "servicios_sociales"
        | "otra_ong"
        | "internet"
        | "presencial_directo"
        | "whatsapp"
        | "telefono"
        | "email"
        | "instagram"
        | "retorno_bocatas"
        | "otros"
      consent_language: "es" | "ar" | "fr" | "bm"
      consent_purpose:
        | "tratamiento_datos_bocatas"
        | "tratamiento_datos_banco_alimentos"
        | "compartir_datos_red"
        | "comunicaciones_whatsapp"
        | "fotografia"
      estabilidad_habitacional:
        | "sin_hogar"
        | "inestable"
        | "temporal"
        | "estable"
      estado_enrollment: "activo" | "pausado" | "completado" | "rechazado"
      fase_itinerario:
        | "acogida"
        | "estabilizacion"
        | "formacion"
        | "insercion_laboral"
        | "autonomia"
      genero: "masculino" | "femenino" | "no_binario" | "prefiere_no_decir"
      idioma: "es" | "ar" | "fr" | "bm" | "en" | "ro" | "zh" | "wo" | "other"
      metodo_checkin: "qr_scan" | "manual_busqueda" | "conteo_anonimo"
      motivo_baja_familia:
        | "no_recogida_consecutiva"
        | "voluntaria"
        | "fraude"
        | "cambio_circunstancias"
        | "otros"
      nivel_estudios:
        | "sin_estudios"
        | "primaria"
        | "secundaria"
        | "bachillerato"
        | "formacion_profesional"
        | "universitario"
        | "postgrado"
      nivel_ingresos:
        | "sin_ingresos"
        | "menos_500"
        | "entre_500_1000"
        | "entre_1000_1500"
        | "mas_1500"
      programa:
        | "comedor"
        | "familia"
        | "formacion"
        | "atencion_juridica"
        | "voluntariado"
        | "acompanamiento"
      situacion_laboral:
        | "desempleado"
        | "economia_informal"
        | "empleo_temporal"
        | "empleo_indefinido"
        | "autonomo"
        | "en_formacion"
        | "jubilado"
        | "incapacidad_permanente"
        | "sin_permiso_trabajo"
      tipo_documento: "DNI" | "NIE" | "Pasaporte" | "Sin_Documentacion"
      tipo_vivienda:
        | "calle"
        | "albergue"
        | "piso_compartido_alquiler"
        | "piso_propio_alquiler"
        | "piso_propio_propiedad"
        | "ocupacion_sin_titulo"
        | "pension"
        | "asentamiento"
        | "centro_acogida"
        | "otros"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      canal_llegada: [
        "boca_a_boca",
        "cruz_roja",
        "servicios_sociales",
        "otra_ong",
        "internet",
        "presencial_directo",
        "whatsapp",
        "telefono",
        "email",
        "instagram",
        "retorno_bocatas",
        "otros",
      ],
      consent_language: ["es", "ar", "fr", "bm"],
      consent_purpose: [
        "tratamiento_datos_bocatas",
        "tratamiento_datos_banco_alimentos",
        "compartir_datos_red",
        "comunicaciones_whatsapp",
        "fotografia",
      ],
      estabilidad_habitacional: [
        "sin_hogar",
        "inestable",
        "temporal",
        "estable",
      ],
      estado_enrollment: ["activo", "pausado", "completado", "rechazado"],
      fase_itinerario: [
        "acogida",
        "estabilizacion",
        "formacion",
        "insercion_laboral",
        "autonomia",
      ],
      genero: ["masculino", "femenino", "no_binario", "prefiere_no_decir"],
      idioma: ["es", "ar", "fr", "bm", "en", "ro", "zh", "wo", "other"],
      metodo_checkin: ["qr_scan", "manual_busqueda", "conteo_anonimo"],
      motivo_baja_familia: [
        "no_recogida_consecutiva",
        "voluntaria",
        "fraude",
        "cambio_circunstancias",
        "otros",
      ],
      nivel_estudios: [
        "sin_estudios",
        "primaria",
        "secundaria",
        "bachillerato",
        "formacion_profesional",
        "universitario",
        "postgrado",
      ],
      nivel_ingresos: [
        "sin_ingresos",
        "menos_500",
        "entre_500_1000",
        "entre_1000_1500",
        "mas_1500",
      ],
      programa: [
        "comedor",
        "familia",
        "formacion",
        "atencion_juridica",
        "voluntariado",
        "acompanamiento",
      ],
      situacion_laboral: [
        "desempleado",
        "economia_informal",
        "empleo_temporal",
        "empleo_indefinido",
        "autonomo",
        "en_formacion",
        "jubilado",
        "incapacidad_permanente",
        "sin_permiso_trabajo",
      ],
      tipo_documento: ["DNI", "NIE", "Pasaporte", "Sin_Documentacion"],
      tipo_vivienda: [
        "calle",
        "albergue",
        "piso_compartido_alquiler",
        "piso_propio_alquiler",
        "piso_propio_propiedad",
        "ocupacion_sin_titulo",
        "pension",
        "asentamiento",
        "centro_acogida",
        "otros",
      ],
    },
  },
} as const
