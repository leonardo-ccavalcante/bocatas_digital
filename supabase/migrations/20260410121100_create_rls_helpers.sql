CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    'beneficiario'  -- default to most restrictive
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_person_id()
RETURNS UUID AS $$
  SELECT ((auth.jwt() -> 'app_metadata' ->> 'person_id'))::UUID;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
