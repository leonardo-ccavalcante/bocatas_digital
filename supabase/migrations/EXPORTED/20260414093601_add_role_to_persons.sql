-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260414093601 — name: add_role_to_persons

ALTER TABLE persons ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'beneficiario';
ALTER TABLE persons ADD CONSTRAINT check_persons_role CHECK (role IN ('user', 'admin', 'superadmin', 'voluntario', 'beneficiario'));
CREATE INDEX idx_persons_role ON persons (role) WHERE deleted_at IS NULL;
