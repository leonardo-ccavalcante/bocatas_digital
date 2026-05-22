-- T-Doc-3: store the photographed SIGNED Hoja de Firmas per delivery day.
--
-- The signed acta is one collective sheet per (round, day) — not a per-member
-- document — so it does NOT fit family_member_documents. Rather than add a new
-- table, store a round/day-scoped map on delivery_rounds:
--   signed_actas = { "<assigned_day>": { "url": "<storage-path>", "by": "<user>", "at": "<iso>" }, ... }
-- The photo bytes live in the existing private `family-documents` storage bucket
-- (path actas-firmadas/<round_id>/<day>.<ext>); only the path + audit fields are
-- stored here (no PII in the column).

ALTER TABLE public.delivery_rounds
  ADD COLUMN IF NOT EXISTS signed_actas JSONB NOT NULL DEFAULT '{}'::jsonb;
