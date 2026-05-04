#!/usr/bin/env bash
# Creates the `family-documents` Supabase Storage bucket (private) and applies RLS policies.
# Run AFTER migrations 20260430000001/2/3 have been applied.
# Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY env vars, and `curl` + `jq`.

set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL must be set (e.g. https://xxx.supabase.co)}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY must be set (service_role key, NEVER anon)}"

BUCKET="family-documents"

echo "[1/3] Checking if bucket '$BUCKET' already exists..."
EXISTS=$(curl -s -X GET \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/storage/v1/bucket/$BUCKET" \
  -o /dev/null -w "%{http_code}")

if [[ "$EXISTS" == "200" ]]; then
  echo "Bucket '$BUCKET' already exists. Skipping creation."
else
  echo "[2/3] Creating private bucket '$BUCKET'..."
  curl -fsS -X POST \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    "$SUPABASE_URL/storage/v1/bucket" \
    -d "{\"id\":\"$BUCKET\",\"name\":\"$BUCKET\",\"public\":false,\"file_size_limit\":10485760,\"allowed_mime_types\":[\"image/jpeg\",\"image/png\",\"image/webp\",\"application/pdf\"]}"
  echo
  echo "Bucket created."
fi

echo "[3/3] Apply RLS policies for the bucket via SQL (run separately):"
cat <<'SQL'
-- Apply the following SQL via psql or the Supabase SQL editor as the postgres role:

-- Idempotent: drop existing policies before re-creating
DROP POLICY IF EXISTS "family_documents_select_admin" ON storage.objects;
DROP POLICY IF EXISTS "family_documents_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "family_documents_update_admin" ON storage.objects;
DROP POLICY IF EXISTS "family_documents_delete_admin" ON storage.objects;

-- SELECT (read): admin + superadmin only
CREATE POLICY "family_documents_select_admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'family-documents'
    AND public.get_user_role() IN ('superadmin', 'admin')
  );

-- INSERT (upload): admin + superadmin only
CREATE POLICY "family_documents_insert_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'family-documents'
    AND public.get_user_role() IN ('superadmin', 'admin')
  );

-- UPDATE: admin + superadmin only
CREATE POLICY "family_documents_update_admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'family-documents'
    AND public.get_user_role() IN ('superadmin', 'admin')
  );

-- DELETE: admin + superadmin only
CREATE POLICY "family_documents_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'family-documents'
    AND public.get_user_role() IN ('superadmin', 'admin')
  );
SQL

echo
echo "Done."
