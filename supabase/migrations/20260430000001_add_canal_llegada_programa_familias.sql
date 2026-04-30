-- Migration: Add 'programa_familias' to canal_llegada enum
-- This file must run OUTSIDE a transaction block (Supabase handles this for enum additions)
--
-- NOTE: Storage bucket `family-documents` (private, RLS = admin/superadmin)
-- must be created separately via Supabase Storage API or `supabase storage` CLI.
-- See Manus IM handoff doc for the exact bucket-creation steps.

ALTER TYPE canal_llegada ADD VALUE IF NOT EXISTS 'programa_familias';
