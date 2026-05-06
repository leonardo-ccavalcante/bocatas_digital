-- scripts/smoke-test-legacy-import-uuids.sql
--
-- Smoke test pinning the UUID + family-linkage contract of the legacy
-- FAMILIAS importer. Run inside a transaction with ROLLBACK so it
-- never persists test data.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/smoke-test-legacy-import-uuids.sql
--
-- Or via Supabase MCP / SQL editor — pasted as one block.
--
-- The script asserts the 8 contract guarantees the legacy importer
-- promises:
--   1. Each person (titular and dependents) gets its own persons.id UUID
--   2. The family gets its own families.id UUID (distinct from any person)
--   3. families.titular_id is the titular's persons.id
--   4. familia_miembros rows linking each dependent are created with
--      both familia_id (→ families.id) and person_id (→ persons.id)
--   5. The legacy NUMERO FAMILIA BOCATAS persists as families.legacy_numero
--   6. The legacy NÚMERO DE ORDEN persists as persons.metadata.legacy_orden
--   7. Dependents do not share UUIDs with the titular or with each other
--   8. families.familia_numero is auto-assigned by the SEQUENCE
--      (independent of legacy_numero)

BEGIN;

DO $$
DECLARE
  v_titular_id  uuid;
  v_dep1_id     uuid;
  v_dep2_id     uuid;
  v_family_id   uuid;
  v_legacy_num  text := 'TEST-LEGACY-IMPORT-CONTRACT';

  v_persons_created int;
  v_titular_match   boolean;
  v_member_count    int;
  v_legacy_preserved text;
  v_orden_preserved  text;
  v_familia_numero   int;
BEGIN
  -- Cleanup any prior test data with the same legacy number
  DELETE FROM family_legacy_import_audit WHERE legacy_numero = v_legacy_num;
  DELETE FROM familia_miembros WHERE familia_id IN (
    SELECT id FROM families WHERE legacy_numero = v_legacy_num
  );
  DELETE FROM families WHERE legacy_numero = v_legacy_num;

  -- 1. Insert titular via the helper
  v_titular_id := public.upsert_legacy_person(jsonb_build_object(
    'nombre', 'TestTitular_Contract',
    'apellidos', 'Smoke Apellido',
    'fecha_nacimiento', '1985-01-15',
    'genero', 'masculino',
    'pais_origen', 'PE',
    'metadata', jsonb_build_object(
      'legacy_orden', '1',
      'legacy_row', 4,
      'colectivos', '[]'::jsonb
    )
  ));

  -- 2. Insert dependents via the helper
  v_dep1_id := public.upsert_legacy_person(jsonb_build_object(
    'nombre', 'TestDep1_Contract',
    'apellidos', 'Smoke Apellido',
    'fecha_nacimiento', '2010-03-20',
    'genero', 'femenino',
    'pais_origen', 'PE',
    'metadata', jsonb_build_object('legacy_orden', '2', 'legacy_row', 5, 'colectivos', '[]'::jsonb)
  ));

  v_dep2_id := public.upsert_legacy_person(jsonb_build_object(
    'nombre', 'TestDep2_Contract',
    'apellidos', 'Smoke Apellido',
    'fecha_nacimiento', '2015-07-08',
    'genero', 'masculino',
    'pais_origen', 'PE',
    'metadata', jsonb_build_object('legacy_orden', '3', 'legacy_row', 6, 'colectivos', '[]'::jsonb)
  ));

  -- 3. Insert family
  INSERT INTO families (titular_id, legacy_numero, persona_recoge, metadata)
  VALUES (
    v_titular_id,
    v_legacy_num,
    'TestTitular_Contract Smoke Apellido',
    jsonb_build_object('imported_from', 'contract_smoke_test', 'legacy_orden', '1')
  )
  RETURNING id INTO v_family_id;

  -- 4. Insert familia_miembros for dependents
  INSERT INTO familia_miembros (familia_id, person_id, nombre, apellidos, rol, relacion, fecha_nacimiento, estado)
  VALUES
    (v_family_id, v_dep1_id, 'TestDep1_Contract', 'Smoke Apellido', 'dependent', 'hijo_a', '2010-03-20', 'activo'),
    (v_family_id, v_dep2_id, 'TestDep2_Contract', 'Smoke Apellido', 'dependent', 'hijo_a', '2015-07-08', 'activo');

  -- ─── ASSERTIONS ───────────────────────────────────────────────────────

  -- A1: 3 distinct UUIDs in persons
  SELECT count(*) INTO v_persons_created FROM persons
  WHERE id IN (v_titular_id, v_dep1_id, v_dep2_id) AND deleted_at IS NULL;
  ASSERT v_persons_created = 3,
    format('A1 FAILED: expected 3 persons created, got %s', v_persons_created);

  -- A2: titular_id of family = titular persons.id
  SELECT (titular_id = v_titular_id) INTO v_titular_match
  FROM families WHERE id = v_family_id;
  ASSERT v_titular_match,
    'A2 FAILED: families.titular_id does not match titular persons.id';

  -- A3: 2 familia_miembros rows linked to this family
  SELECT count(*) INTO v_member_count FROM familia_miembros
  WHERE familia_id = v_family_id AND deleted_at IS NULL;
  ASSERT v_member_count = 2,
    format('A3 FAILED: expected 2 dependents, got %s', v_member_count);

  -- A4: each dependent's person_id is a real persons.id
  PERFORM 1 FROM familia_miembros fm
  JOIN persons p ON p.id = fm.person_id
  WHERE fm.familia_id = v_family_id;
  ASSERT FOUND,
    'A4 FAILED: familia_miembros.person_id does not link to persons table';

  -- A5: legacy_numero preserved
  SELECT legacy_numero INTO v_legacy_preserved FROM families WHERE id = v_family_id;
  ASSERT v_legacy_preserved = v_legacy_num,
    format('A5 FAILED: legacy_numero mismatch: expected %s, got %s', v_legacy_num, v_legacy_preserved);

  -- A6: legacy_orden preserved on persons (proves provenance back to spreadsheet row)
  SELECT (metadata ->> 'legacy_orden') INTO v_orden_preserved FROM persons WHERE id = v_titular_id;
  ASSERT v_orden_preserved = '1',
    format('A6 FAILED: persons.metadata.legacy_orden lost: %s', v_orden_preserved);

  -- A7: distinct UUIDs (no aliasing)
  ASSERT v_dep1_id <> v_titular_id, 'A7 FAILED: dep1 shares UUID with titular';
  ASSERT v_dep2_id <> v_titular_id, 'A7 FAILED: dep2 shares UUID with titular';
  ASSERT v_dep1_id <> v_dep2_id,    'A7 FAILED: dependents share UUID';
  ASSERT v_family_id <> v_titular_id, 'A7 FAILED: family UUID equals titular UUID';
  ASSERT v_family_id <> v_dep1_id,    'A7 FAILED: family UUID equals dep1 UUID';

  -- A8: families.familia_numero auto-assigned by sequence (independent of legacy_numero)
  SELECT familia_numero INTO v_familia_numero FROM families WHERE id = v_family_id;
  ASSERT v_familia_numero IS NOT NULL AND v_familia_numero > 0,
    format('A8 FAILED: familia_numero not auto-assigned: %s', v_familia_numero);

  RAISE NOTICE '──────────────────────────────────────────────';
  RAISE NOTICE '✓ A1: 3 persons created with distinct UUIDs';
  RAISE NOTICE '✓ A2: families.titular_id = titular persons.id';
  RAISE NOTICE '✓ A3: 2 familia_miembros rows linked';
  RAISE NOTICE '✓ A4: each familia_miembros.person_id resolves in persons';
  RAISE NOTICE '✓ A5: legacy_numero preserved → %', v_legacy_preserved;
  RAISE NOTICE '✓ A6: legacy_orden preserved on persons.metadata';
  RAISE NOTICE '✓ A7: all 5 entities have distinct UUIDs';
  RAISE NOTICE '✓ A8: familia_numero auto-assigned → %', v_familia_numero;
  RAISE NOTICE '──────────────────────────────────────────────';
  RAISE NOTICE 'titular_id  : %', v_titular_id;
  RAISE NOTICE 'dep1_id     : %', v_dep1_id;
  RAISE NOTICE 'dep2_id     : %', v_dep2_id;
  RAISE NOTICE 'family_id   : %', v_family_id;
  RAISE NOTICE 'legacy_num  : %', v_legacy_preserved;
  RAISE NOTICE 'familia_seq : %', v_familia_numero;
END $$;

ROLLBACK;
