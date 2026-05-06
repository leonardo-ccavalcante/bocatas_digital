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
      announcement_audiences: {
        Row: {
          announcement_id: string
          created_at: string
          id: string
          programs: Database["public"]["Enums"]["programa"][]
          roles: string[]
        }
        Insert: {
          announcement_id: string
          created_at?: string
          id?: string
          programs?: Database["public"]["Enums"]["programa"][]
          roles?: string[]
        }
        Update: {
          announcement_id?: string
          created_at?: string
          id?: string
          programs?: Database["public"]["Enums"]["programa"][]
          roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "announcement_audiences_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_audit_log: {
        Row: {
          announcement_id: string
          edited_at: string
          edited_by: string
          field: string
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          announcement_id: string
          edited_at?: string
          edited_by: string
          field: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          announcement_id?: string
          edited_at?: string
          edited_by?: string
          field?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "announcement_audit_log_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          person_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          person_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_webhook_log: {
        Row: {
          announcement_id: string
          attempted_at: string
          error: string | null
          id: string
          response_body: string | null
          status_code: number | null
        }
        Insert: {
          announcement_id: string
          attempted_at?: string
          error?: string | null
          id?: string
          response_body?: string | null
          status_code?: number | null
        }
        Update: {
          announcement_id?: string
          attempted_at?: string
          error?: string | null
          id?: string
          response_body?: string | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "announcement_webhook_log_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          activo: boolean
          audiences: Json | null
          autor_id: string | null
          autor_nombre: string | null
          contenido: string
          created_at: string
          deleted_at: string | null
          es_urgente: boolean
          expires_at: string | null
          fecha_fin: string | null
          fecha_inicio: string
          fijado: boolean
          id: string
          image_url: string | null
          imagen_url: string | null
          published_at: string | null
          tipo: Database["public"]["Enums"]["tipo_announcement"]
          titulo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          audiences?: Json | null
          autor_id?: string | null
          autor_nombre?: string | null
          contenido: string
          created_at?: string
          deleted_at?: string | null
          es_urgente?: boolean
          expires_at?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string
          fijado?: boolean
          id?: string
          image_url?: string | null
          imagen_url?: string | null
          published_at?: string | null
          tipo?: Database["public"]["Enums"]["tipo_announcement"]
          titulo: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          audiences?: Json | null
          autor_id?: string | null
          autor_nombre?: string | null
          contenido?: string
          created_at?: string
          deleted_at?: string | null
          es_urgente?: boolean
          expires_at?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string
          fijado?: boolean
          id?: string
          image_url?: string | null
          imagen_url?: string | null
          published_at?: string | null
          tipo?: Database["public"]["Enums"]["tipo_announcement"]
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
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
          programa: string | null
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
          programa?: string | null
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
          programa?: string | null
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
          {
            foreignKeyName: "fk_attendances_programa"
            columns: ["programa"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["slug"]
          },
        ]
      }
      bulk_import_previews: {
        Row: {
          created_at: string
          created_by: string
          parsed_rows: Json
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          parsed_rows: Json
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          parsed_rows?: Json
          token?: string
        }
        Relationships: []
      }
      consent_templates: {
        Row: {
          created_at: string | null
          id: string
          idioma: Database["public"]["Enums"]["consent_language"]
          is_active: boolean
          purpose: Database["public"]["Enums"]["consent_purpose"]
          text_content: string
          updated_at: string | null
          updated_by: string | null
          version: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          idioma: Database["public"]["Enums"]["consent_language"]
          is_active?: boolean
          purpose: Database["public"]["Enums"]["consent_purpose"]
          text_content: string
          updated_at?: string | null
          updated_by?: string | null
          version?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          idioma?: Database["public"]["Enums"]["consent_language"]
          is_active?: boolean
          purpose?: Database["public"]["Enums"]["consent_purpose"]
          text_content?: string
          updated_at?: string | null
          updated_by?: string | null
          version?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          consent_text: string
          consent_version: string
          created_at: string
          deleted_at: string | null
          documento_foto_url: string | null
          documento_url: string | null
          firma_url: string | null
          granted: boolean
          granted_at: string | null
          id: string
          idioma: Database["public"]["Enums"]["consent_language"]
          ip_address: unknown
          metadata: Json | null
          numero_serie: string | null
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
          documento_foto_url?: string | null
          documento_url?: string | null
          firma_url?: string | null
          granted: boolean
          granted_at?: string | null
          id?: string
          idioma: Database["public"]["Enums"]["consent_language"]
          ip_address?: unknown
          metadata?: Json | null
          numero_serie?: string | null
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
          documento_foto_url?: string | null
          documento_url?: string | null
          firma_url?: string | null
          granted?: boolean
          granted_at?: string | null
          id?: string
          idioma?: Database["public"]["Enums"]["consent_language"]
          ip_address?: unknown
          metadata?: Json | null
          numero_serie?: string | null
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
      deliveries: {
        Row: {
          created_at: string
          deleted_at: string | null
          es_autorizado: boolean | null
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
          recogido_por_documento_url: string | null
          registrado_por: string | null
          session_id: string | null
          unidades_no_alimenticias: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          es_autorizado?: boolean | null
          family_id: string
          fecha_entrega: string
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
          recogido_por_documento_url?: string | null
          registrado_por?: string | null
          session_id?: string | null
          unidades_no_alimenticias?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          es_autorizado?: boolean | null
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
          recogido_por_documento_url?: string | null
          registrado_por?: string | null
          session_id?: string | null
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
          {
            foreignKeyName: "deliveries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "program_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_signature_audit: {
        Row: {
          client_ip_hash: string | null
          created_at: string
          delivery_id: string
          id: string
          signed_at: string
          signer_person_id: string
        }
        Insert: {
          client_ip_hash?: string | null
          created_at?: string
          delivery_id: string
          id?: string
          signed_at?: string
          signer_person_id: string
        }
        Update: {
          client_ip_hash?: string | null
          created_at?: string
          delivery_id?: string
          id?: string
          signed_at?: string
          signer_person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_signature_audit_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_signature_audit_signer_person_id_fkey"
            columns: ["signer_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_signature_audit_signer_person_id_fkey"
            columns: ["signer_person_id"]
            isOneToOne: false
            referencedRelation: "persons_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      familia_miembros: {
        Row: {
          apellidos: string | null
          created_at: string | null
          deleted_at: string | null
          documentacion_id: string | null
          documento: string | null
          estado: string | null
          familia_id: string
          fecha_nacimiento: string | null
          id: string
          nombre: string
          person_id: string | null
          relacion: string | null
          rol: string
          updated_at: string | null
        }
        Insert: {
          apellidos?: string | null
          created_at?: string | null
          deleted_at?: string | null
          documentacion_id?: string | null
          documento?: string | null
          estado?: string | null
          familia_id: string
          fecha_nacimiento?: string | null
          id?: string
          nombre: string
          person_id?: string | null
          relacion?: string | null
          rol: string
          updated_at?: string | null
        }
        Update: {
          apellidos?: string | null
          created_at?: string | null
          deleted_at?: string | null
          documentacion_id?: string | null
          documento?: string | null
          estado?: string | null
          familia_id?: string
          fecha_nacimiento?: string | null
          id?: string
          nombre?: string
          person_id?: string | null
          relacion?: string | null
          rol?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "familia_miembros_documentacion_id_fkey"
            columns: ["documentacion_id"]
            isOneToOne: false
            referencedRelation: "family_member_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "familia_miembros_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "familia_miembros_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "familia_miembros_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          alta_en_guf: boolean | null
          autorizado: boolean | null
          autorizado_documento_url: string | null
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
          guf_cutoff_day: number | null
          guf_verified_at: string | null
          id: string
          informe_social: boolean | null
          informe_social_fecha: string | null
          justificante_recibido: boolean | null
          legacy_numero: string | null
          metadata: Json | null
          motivo_baja: Database["public"]["Enums"]["motivo_baja_familia"] | null
          num_adultos: number | null
          num_menores_18: number | null
          num_miembros: number | null
          padron_recibido: boolean | null
          padron_recibido_fecha: string | null
          persona_recoge: string | null
          sin_guf: boolean | null
          sin_informe_social: boolean | null
          titular_id: string | null
          updated_at: string
        }
        Insert: {
          alta_en_guf?: boolean | null
          autorizado?: boolean | null
          autorizado_documento_url?: string | null
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
          guf_cutoff_day?: number | null
          guf_verified_at?: string | null
          id?: string
          informe_social?: boolean | null
          informe_social_fecha?: string | null
          justificante_recibido?: boolean | null
          legacy_numero?: string | null
          metadata?: Json | null
          motivo_baja?:
            | Database["public"]["Enums"]["motivo_baja_familia"]
            | null
          num_adultos?: number | null
          num_menores_18?: number | null
          num_miembros?: number | null
          padron_recibido?: boolean | null
          padron_recibido_fecha?: string | null
          persona_recoge?: string | null
          sin_guf?: boolean | null
          sin_informe_social?: boolean | null
          titular_id?: string | null
          updated_at?: string
        }
        Update: {
          alta_en_guf?: boolean | null
          autorizado?: boolean | null
          autorizado_documento_url?: string | null
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
          guf_cutoff_day?: number | null
          guf_verified_at?: string | null
          id?: string
          informe_social?: boolean | null
          informe_social_fecha?: string | null
          justificante_recibido?: boolean | null
          legacy_numero?: string | null
          metadata?: Json | null
          motivo_baja?:
            | Database["public"]["Enums"]["motivo_baja_familia"]
            | null
          num_adultos?: number | null
          num_menores_18?: number | null
          num_miembros?: number | null
          padron_recibido?: boolean | null
          padron_recibido_fecha?: string | null
          persona_recoge?: string | null
          sin_guf?: boolean | null
          sin_informe_social?: boolean | null
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
      family_legacy_import_audit: {
        Row: {
          actor_id: string
          family_id: string | null
          id: string
          legacy_numero: string
          notes: string | null
          operation: string
          row_count: number
          src_filename: string | null
          ts: string
        }
        Insert: {
          actor_id: string
          family_id?: string | null
          id?: string
          legacy_numero: string
          notes?: string | null
          operation: string
          row_count: number
          src_filename?: string | null
          ts?: string
        }
        Update: {
          actor_id?: string
          family_id?: string | null
          id?: string
          legacy_numero?: string
          notes?: string | null
          operation?: string
          row_count?: number
          src_filename?: string | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_legacy_import_audit_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_member_documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          documento_tipo: string
          documento_url: string | null
          family_id: string
          fecha_upload: string | null
          id: string
          is_current: boolean
          member_id: string | null
          member_index: number
          member_person_id: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          documento_tipo: string
          documento_url?: string | null
          family_id: string
          fecha_upload?: string | null
          id?: string
          is_current?: boolean
          member_id?: string | null
          member_index: number
          member_person_id?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          documento_tipo?: string
          documento_url?: string | null
          family_id?: string
          fecha_upload?: string | null
          id?: string
          is_current?: boolean
          member_id?: string | null
          member_index?: number
          member_person_id?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_member_documents_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_member_documents_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "familia_miembros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_member_documents_member_person_id_fkey"
            columns: ["member_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_member_documents_member_person_id_fkey"
            columns: ["member_person_id"]
            isOneToOne: false
            referencedRelation: "persons_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      family_webhook_log: {
        Row: {
          attempted_at: string
          error: string | null
          event: string
          family_id: string
          id: string
          response_body: string | null
          status_code: number | null
        }
        Insert: {
          attempted_at?: string
          error?: string | null
          event: string
          family_id: string
          id?: string
          response_body?: string | null
          status_code?: number | null
        }
        Update: {
          attempted_at?: string
          error?: string | null
          event?: string
          family_id?: string
          id?: string
          response_body?: string | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "family_webhook_log_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
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
          foto_perfil_url: string | null
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
          pais_documento: string | null
          pais_origen: string | null
          persona_referencia: string | null
          recorrido_migratorio: string | null
          restricciones_alimentarias: string | null
          role: string
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
          foto_perfil_url?: string | null
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
          pais_documento?: string | null
          pais_origen?: string | null
          persona_referencia?: string | null
          recorrido_migratorio?: string | null
          restricciones_alimentarias?: string | null
          role?: string
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
          foto_perfil_url?: string | null
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
          pais_documento?: string | null
          pais_origen?: string | null
          persona_referencia?: string | null
          recorrido_migratorio?: string | null
          restricciones_alimentarias?: string | null
          role?: string
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
          program_id: string
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
          program_id: string
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
          program_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_enrollment_program"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
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
          {
            foreignKeyName: "program_enrollments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          fecha: string
          id: string
          location_id: string | null
          opened_by: string | null
          program_id: string
          session_data: Json | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          fecha?: string
          id?: string
          location_id?: string | null
          opened_by?: string | null
          program_id: string
          session_data?: Json | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          fecha?: string
          id?: string
          location_id?: string | null
          opened_by?: string | null
          program_id?: string
          session_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "program_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          config: Json
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          display_order: number
          fecha_fin: string | null
          fecha_inicio: string | null
          icon: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          requires_consents: string[]
          requires_fields: Json | null
          responsable_id: string | null
          session_close_config: Json | null
          slug: string
          updated_at: string | null
          volunteer_can_access: boolean
          volunteer_can_write: boolean
          volunteer_visible_fields: string[]
        }
        Insert: {
          config?: Json
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          fecha_fin?: string | null
          fecha_inicio?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          requires_consents?: string[]
          requires_fields?: Json | null
          responsable_id?: string | null
          session_close_config?: Json | null
          slug: string
          updated_at?: string | null
          volunteer_can_access?: boolean
          volunteer_can_write?: boolean
          volunteer_visible_fields?: string[]
        }
        Update: {
          config?: Json
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          fecha_fin?: string | null
          fecha_inicio?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          requires_consents?: string[]
          requires_fields?: Json | null
          responsable_id?: string | null
          session_close_config?: Json | null
          slug?: string
          updated_at?: string | null
          volunteer_can_access?: boolean
          volunteer_can_write?: boolean
          volunteer_visible_fields?: string[]
        }
        Relationships: []
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
          foto_perfil_url: string | null
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
          restricciones_alimentarias: string | null
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
          foto_perfil_url?: string | null
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
          restricciones_alimentarias?: string | null
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
          foto_perfil_url?: string | null
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
          restricciones_alimentarias?: string | null
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
      check_soft_delete_schema: {
        Args: { table_names: string[] }
        Returns: {
          has_deleted_at: boolean
          has_index: boolean
          table_name: string
        }[]
      }
      confirm_bulk_announcement_import: {
        Args: { p_autor_id: string; p_autor_nombre: string; p_token: string }
        Returns: Json
      }
      confirm_legacy_familias_import: {
        Args: { p_src_filename?: string; p_token: string }
        Returns: Json
      }
      find_duplicate_persons: {
        Args: { p_apellidos: string; p_nombre: string; p_threshold?: number }
        Returns: {
          apellidos: string
          fecha_nacimiento: string
          foto_perfil_url: string
          id: string
          nombre: string
          similarity: number
        }[]
      }
      get_person_id: { Args: never; Returns: string }
      get_programs_with_counts: {
        Args: never
        Returns: {
          active_enrollments: number
          config: Json
          description: string
          display_order: number
          fecha_fin: string
          fecha_inicio: string
          icon: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          new_this_month: number
          requires_consents: string[]
          requires_fields: Json
          responsable_id: string
          slug: string
          total_enrollments: number
          volunteer_can_access: boolean
        }[]
      }
      get_user_role: { Args: never; Returns: string }
      sanitize_audit_error: { Args: { p_msg: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      upload_family_document: {
        Args: {
          p_documento_tipo: string
          p_documento_url: string
          p_family_id: string
          p_member_index: number
          p_member_person_id: string
          p_verified_by: string
        }
        Returns: {
          created_at: string
          deleted_at: string | null
          documento_tipo: string
          documento_url: string | null
          family_id: string
          fecha_upload: string | null
          id: string
          is_current: boolean
          member_id: string | null
          member_index: number
          member_person_id: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "family_member_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_legacy_person: { Args: { p_person: Json }; Returns: string }
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
        | "programa_familias"
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
      tipo_announcement:
        | "info"
        | "evento"
        | "cierre_servicio"
        | "convocatoria"
        | "cierre"
        | "urgente"
      tipo_documento:
        | "DNI"
        | "NIE"
        | "Pasaporte"
        | "Sin_Documentacion"
        | "Documento_Extranjero"
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
        "programa_familias",
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
      tipo_announcement: [
        "info",
        "evento",
        "cierre_servicio",
        "convocatoria",
        "cierre",
        "urgente",
      ],
      tipo_documento: [
        "DNI",
        "NIE",
        "Pasaporte",
        "Sin_Documentacion",
        "Documento_Extranjero",
      ],
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
