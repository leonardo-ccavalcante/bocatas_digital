-- Schema snapshot of 7 tables dropped by 20260506000001_drop_dead_tables.sql
-- Captured 2026-05-05. Column definitions only (no row data, no policies).
-- See README.md for rationale and restore guidance.

CREATE TABLE public.acompanamientos (
  id uuid NOT NULL,
  person_id uuid NOT NULL,
  tipo text,
  estado text,
  asignado_a uuid,
  entidad_derivacion text,
  descripcion text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE public.courses (
  id uuid NOT NULL,
  nombre text NOT NULL,
  tipo text,
  descripcion text,
  fecha_inicio date,
  fecha_fin date,
  cupo_maximo integer,
  estado text,
  location_id uuid,
  formador text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE public.entregas (
  id uuid NOT NULL,
  entregas_batch_id uuid NOT NULL,
  familia_id uuid NOT NULL,
  fecha character varying NOT NULL,
  persona_recibio character varying,
  frutas_hortalizas_cantidad integer,
  frutas_hortalizas_unidad character varying,
  carne_cantidad integer,
  carne_unidad character varying,
  notas text,
  ocr_row_confidence integer,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone NOT NULL
);

CREATE TABLE public.entregas_batch (
  id uuid NOT NULL,
  numero_albaran character varying NOT NULL,
  numero_reparto character varying NOT NULL,
  numero_factura_carne character varying,
  total_personas_asistidas integer NOT NULL,
  fecha_reparto character varying NOT NULL,
  documento_imagen_url text,
  ocr_confidence integer,
  estado_batch character varying NOT NULL,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone NOT NULL,
  estado character varying
);

CREATE TABLE public.families_miembros_backup_20260505 (
  id uuid,
  miembros jsonb,
  backup_taken_at timestamp with time zone
);

CREATE TABLE public.families_pre_backfill_20260430 (
  id uuid,
  docs_identidad boolean,
  padron_recibido boolean,
  justificante_recibido boolean,
  consent_bocatas boolean,
  consent_banco_alimentos boolean,
  informe_social boolean
);

CREATE TABLE public.volunteers (
  id uuid NOT NULL,
  person_id uuid NOT NULL,
  user_id uuid,
  fecha_alta date NOT NULL,
  fecha_baja date,
  activo boolean NOT NULL,
  seguro_numero text,
  seguro_caducidad date,
  disponibilidad jsonb,
  habilidades text[],
  metadata jsonb,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  deleted_at timestamp with time zone
);
