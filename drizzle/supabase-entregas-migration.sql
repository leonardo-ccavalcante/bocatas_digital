-- Supabase PostgreSQL Migration: Create entregas, entregas_batch, and families tables
-- This migration moves these tables from Manus MySQL (Drizzle) to Supabase PostgreSQL
-- for single source of truth architecture

-- 1. Create entregas_batch table
CREATE TABLE IF NOT EXISTS entregas_batch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estado VARCHAR(50) NOT NULL DEFAULT 'pendiente',
  total_personas INTEGER NOT NULL DEFAULT 0,
  fecha_procesamiento TIMESTAMP WITH TIME ZONE,
  createdAt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updatedAt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Create families table
CREATE TABLE IF NOT EXISTS families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estado VARCHAR(50) NOT NULL DEFAULT 'activa',
  sin_guf BOOLEAN NOT NULL DEFAULT FALSE,
  sin_informe_social BOOLEAN NOT NULL DEFAULT FALSE,
  createdAt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updatedAt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Create entregas table
CREATE TABLE IF NOT EXISTS entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entregas_batch_id UUID REFERENCES entregas_batch(id) ON DELETE SET NULL,
  familia_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  fecha TIMESTAMP WITH TIME ZONE NOT NULL,
  persona_recibio VARCHAR(255),
  frutas_hortalizas_cantidad DECIMAL(10, 2),
  frutas_hortalizas_unidad VARCHAR(50),
  carne_cantidad DECIMAL(10, 2),
  carne_unidad VARCHAR(50),
  notas TEXT,
  ocr_row_confidence DECIMAL(5, 3),
  createdAt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updatedAt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_entregas_familia_id ON entregas(familia_id);
CREATE INDEX IF NOT EXISTS idx_entregas_batch_id ON entregas(entregas_batch_id);
CREATE INDEX IF NOT EXISTS idx_entregas_fecha ON entregas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_families_titular_id ON families(titular_id);
CREATE INDEX IF NOT EXISTS idx_families_estado ON families(estado);

-- 5. Enable RLS (Row Level Security)
ALTER TABLE entregas_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for entregas_batch
CREATE POLICY "Allow authenticated users to read entregas_batch" 
  ON entregas_batch FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow admin to manage entregas_batch" 
  ON entregas_batch FOR ALL 
  USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  ));

-- 7. Create RLS policies for families
CREATE POLICY "Allow authenticated users to read families" 
  ON families FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow admin to manage families" 
  ON families FOR ALL 
  USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  ));

-- 8. Create RLS policies for entregas
CREATE POLICY "Allow authenticated users to read entregas" 
  ON entregas FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow admin to manage entregas" 
  ON entregas FOR ALL 
  USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  ));

-- 9. Create seed data for testing
INSERT INTO families (id, titular_id, estado, sin_guf, sin_informe_social)
SELECT 
  'd0000000-0000-0000-0000-000000000001'::uuid,
  id,
  'activa',
  false,
  false
FROM auth.users 
WHERE email = 'dev@bocatas.io'
LIMIT 1
ON CONFLICT DO NOTHING;

-- 10. Create seed batch
INSERT INTO entregas_batch (id, estado, total_personas, fecha_procesamiento)
VALUES ('d0000000-0000-0000-0000-000000000101'::uuid, 'procesado', 2, now())
ON CONFLICT DO NOTHING;

-- 11. Create seed entregas records
INSERT INTO entregas (
  id, 
  entregas_batch_id, 
  familia_id, 
  fecha, 
  persona_recibio, 
  frutas_hortalizas_cantidad, 
  frutas_hortalizas_unidad, 
  carne_cantidad, 
  carne_unidad,
  notas,
  ocr_row_confidence
)
VALUES 
  (
    'd0000000-0000-0000-0000-000000000201'::uuid,
    'd0000000-0000-0000-0000-000000000101'::uuid,
    'd0000000-0000-0000-0000-000000000001'::uuid,
    '2026-04-11T00:00:00Z'::timestamp with time zone,
    'Maria Garcia Lopez',
    3.5,
    'kg',
    2.0,
    'kg',
    'Delivery on 11/4/2026',
    0.95
  ),
  (
    'd0000000-0000-0000-0000-000000000202'::uuid,
    'd0000000-0000-0000-0000-000000000101'::uuid,
    'd0000000-0000-0000-0000-000000000001'::uuid,
    '2026-03-12T00:00:00Z'::timestamp with time zone,
    'Maria Garcia Lopez',
    3.5,
    'kg',
    2.0,
    'kg',
    'Delivery on 12/3/2026',
    0.95
  )
ON CONFLICT DO NOTHING;
