-- VIEW: excludes 4 high-risk fields (voluntario role uses this)
CREATE OR REPLACE VIEW persons_safe AS
SELECT
  id, nombre, apellidos, fecha_nacimiento, genero, pais_origen,
  idioma_principal, idiomas,
  telefono, email, direccion, municipio, barrio_zona,
  tipo_documento, numero_documento,
  -- EXCLUDED: foto_documento_url, situacion_legal
  fecha_llegada_espana,
  tipo_vivienda, estabilidad_habitacional, empadronado,
  nivel_estudios, situacion_laboral, nivel_ingresos,
  persona_referencia, canal_llegada, entidad_derivadora,
  es_retorno, motivo_retorno,
  -- EXCLUDED: recorrido_migratorio, notas_privadas
  necesidades_principales, observaciones,
  fase_itinerario, estado_empleo, empresa_empleo, alertas_activas,
  metadata, created_at, updated_at, deleted_at
FROM persons;

-- SEED: 3 locations
INSERT INTO locations (id, nombre, tipo, direccion) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Comedor Bocatas - Sede Central', 'comedor', 'Madrid'),
  ('a0000000-0000-0000-0000-000000000002', 'Punto Calle - Opera', 'punto_calle', 'Plaza de Opera, Madrid'),
  ('a0000000-0000-0000-0000-000000000003', 'La Canada', 'punto_calle', 'La Canada Real, Madrid');

-- SEED: 4 test persons
INSERT INTO persons (id, nombre, apellidos, pais_origen, idioma_principal, idiomas,
  fase_itinerario, tipo_documento, canal_llegada) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Mohammed', 'Al-Rashid', 'SY', 'ar', '{ar,es}',
   'acogida', 'Sin_Documentacion', 'boca_a_boca');

INSERT INTO persons (id, nombre, apellidos, pais_origen, idioma_principal, telefono,
  fase_itinerario, tipo_documento, numero_documento, canal_llegada) VALUES
  ('b0000000-0000-0000-0000-000000000002', 'Maria', 'Garcia Lopez', 'ES', 'es', '+34612345678',
   'estabilizacion', 'DNI', '12345678A', 'servicios_sociales');

INSERT INTO persons (id, nombre, apellidos, pais_origen, idioma_principal, idiomas,
  fase_itinerario, tipo_documento, canal_llegada) VALUES
  ('b0000000-0000-0000-0000-000000000003', 'Amadou', 'Diallo', 'ML', 'bm', '{bm,fr,es}',
   'formacion', 'Pasaporte', 'otra_ong');

INSERT INTO persons (id, nombre, apellidos, pais_origen, idioma_principal, telefono,
  fase_itinerario, canal_llegada) VALUES
  ('b0000000-0000-0000-0000-000000000004', 'David', 'Martinez', 'ES', 'es', '+34698765432',
   'autonomia', 'presencial_directo');

-- SEED: 5 enrollments
INSERT INTO program_enrollments (person_id, programa, estado) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'comedor', 'activo'),
  ('b0000000-0000-0000-0000-000000000002', 'comedor', 'activo'),
  ('b0000000-0000-0000-0000-000000000002', 'familia', 'activo'),
  ('b0000000-0000-0000-0000-000000000003', 'comedor', 'activo'),
  ('b0000000-0000-0000-0000-000000000003', 'formacion', 'activo');

-- SEED: 5 attendance records (with programa context)
INSERT INTO attendances (person_id, location_id, programa, checked_in_date, checked_in_at, metodo) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'comedor', CURRENT_DATE, now(), 'qr_scan'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'comedor', CURRENT_DATE, now(), 'manual_busqueda'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'comedor', CURRENT_DATE - 1, now() - interval '1 day', 'qr_scan'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'comedor', CURRENT_DATE - 1, now() - interval '1 day', 'qr_scan'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'comedor', CURRENT_DATE - 2, now() - interval '2 days', 'qr_scan');

-- SEED: 1 test grant (with project allocation)
INSERT INTO grants (id, nombre, financiador, importe, estado, programas_financiados) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'IRPF Alimentos 2026', 'Ministerio de Derechos Sociales', 45000.00, 'en_curso',
   '[{"programa":"familia","importe_asignado":30000},{"programa":"comedor","importe_asignado":15000}]'::jsonb);

-- SEED: 1 test family (with composition fields)
INSERT INTO families (id, titular_id, miembros, num_miembros, num_adultos, num_menores_18) VALUES
  ('d0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000002',
   '[{"nombre":"Carlos","apellidos":"Garcia","parentesco":"esposo_a","fecha_nacimiento":"1982-05-20"},{"nombre":"Lucia","apellidos":"Garcia Lopez","parentesco":"hijo_a","fecha_nacimiento":"2018-11-03"}]'::jsonb,
   3, 2, 1);

-- SEED: 2 test deliveries
INSERT INTO deliveries (family_id, grant_id, fecha_entrega, kg_frutas_hortalizas, kg_carne, kg_otros, kg_total, recogido_por) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', CURRENT_DATE - 30, 3.5, 2.0, 1.5, 7.0, 'Maria Garcia Lopez'),
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', CURRENT_DATE, 3.5, 2.0, 1.5, 7.0, 'Maria Garcia Lopez');
