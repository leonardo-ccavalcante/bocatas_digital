#!/usr/bin/env bash
# PUBLIC bucket -- DO NOT upload PII here. For PII (DNI, signed consents) use the family-documents bucket.
# Creates the `announcement-images` Supabase Storage bucket (public) and applies RLS policies.
# Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY env vars, and `curl` + `jq`.

set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL must be set (e.g. https://xxx.supabase.co)}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY must be set (service_role key, NEVER anon)}"

BUCKET="announcement-images"

echo "[1/3] Checking if bucket '$BUCKET' already exists..."
EXISTS=$(curl -s -X GET \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/storage/v1/bucket/$BUCKET" \
  -o /dev/null -w "%{http_code}")

if [[ "$EXISTS" == "200" ]]; then
  echo "Bucket '$BUCKET' already exists. Skipping creation."
else
  echo "[2/3] Creating public bucket '$BUCKET'..."
  curl -fsS -X POST \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    "$SUPABASE_URL/storage/v1/bucket" \
    -d "{\"id\":\"$BUCKET\",\"name\":\"$BUCKET\",\"public\":true,\"file_size_limit\":5242880,\"allowed_mime_types\":[\"image/jpeg\",\"image/png\",\"image/webp\"]}"
  echo
  echo "Bucket created."
fi

echo "[3/3] Apply RLS policies for the bucket via SQL (run separately):"
cat <<'SQL'
-- Apply the following SQL via psql or the Supabase SQL editor as the postgres role:

-- Idempotent: drop existing policies before re-creating
DROP POLICY IF EXISTS "announcement_images_select_public" ON storage.objects;
DROP POLICY IF EXISTS "announcement_images_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "announcement_images_update_admin" ON storage.objects;
DROP POLICY IF EXISTS "announcement_images_delete_admin" ON storage.objects;

-- SELECT (read): PUBLIC (anyone, even unauthenticated -- bucket is public)
CREATE POLICY "announcement_images_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'announcement-images');

-- INSERT (upload): admin + superadmin only
CREATE POLICY "announcement_images_insert_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'announcement-images'
    AND public.get_user_role() IN ('superadmin', 'admin')
  );

-- UPDATE: admin + superadmin only
CREATE POLICY "announcement_images_update_admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'announcement-images'
    AND public.get_user_role() IN ('superadmin', 'admin')
  );

-- DELETE: admin + superadmin only
CREATE POLICY "announcement_images_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'announcement-images'
    AND public.get_user_role() IN ('superadmin', 'admin')
  );
SQL

echo
echo "Done."
