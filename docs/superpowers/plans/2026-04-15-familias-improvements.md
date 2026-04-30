# Familias Program Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement batch import/export, member management, document upload validation, social reports, and delivery management for the Familias program.

**Architecture:** Five modular features implemented in phases, each with independent data models, tRPC procedures, and React components. Start with member management (lowest complexity), progress through document uploads and social reports, finish with batch import/export (highest complexity).

**Tech Stack:** React 19, tRPC 11, Supabase, S3 (via storagePut), Zod validation, shadcn/ui components

---

## File Structure

### Backend Files (Server)
- `server/routers/familias.ts` — Main familias router (modify)
- `server/db.ts` — Database query helpers (modify)
- `server/familias-import-export.ts` — NEW: CSV parsing and generation
- `server/familias-members.ts` — NEW: Member CRUD helpers

### Frontend Files (Client)
- `client/src/features/families/components/MemberManagementModal.tsx` — NEW
- `client/src/features/families/components/DocumentUploadModal.tsx` — NEW
- `client/src/features/families/components/SocialReportPanel.tsx` — NEW
- `client/src/features/families/components/DeliveryPhotosPanel.tsx` — NEW
- `client/src/features/families/components/ExportFamiliesModal.tsx` — NEW
- `client/src/features/families/components/ImportFamiliesModal.tsx` — NEW
- `client/src/pages/FamiliaDetalle.tsx` — Modify to add modals
- `client/src/features/families/hooks/useFamilias.ts` — Modify to add new queries

### Test Files
- `server/familias-import-export.test.ts` — NEW
- `server/familias-members.test.ts` — NEW
- `client/src/features/families/__tests__/member-management.test.ts` — NEW
- `client/src/features/families/__tests__/document-upload.test.ts` — NEW

### Database Migrations
- `migrations/2026-04-15-familias-members.sql` — NEW
- `migrations/2026-04-15-familias-documents.sql` — NEW
- `migrations/2026-04-15-familias-reports.sql` — NEW
- `migrations/2026-04-15-familias-entregas.sql` — NEW

---

## Phase 1: Member Management

### Task 1: Create familia_miembros table migration

**Files:**
- Create: `migrations/2026-04-15-familias-members.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Create familia_miembros table
CREATE TABLE IF NOT EXISTS familia_miembros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES familias(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('head_of_household', 'dependent', 'other')),
  relacion TEXT CHECK (relacion IN ('parent', 'child', 'sibling', 'other')),
  estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  fecha_nacimiento DATE,
  documentacion_id UUID REFERENCES documentos(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_familia_miembros_familia_id ON familia_miembros(familia_id);
CREATE INDEX idx_familia_miembros_updated_at ON familia_miembros(updated_at);
```

- [ ] **Step 2: Apply migration to Supabase**

Run: `manus-mcp-cli tool call apply_migration --server supabase --input '{"sql": "...migration content..."}'`

- [ ] **Step 3: Verify table created**

Check Supabase dashboard or run: `SELECT * FROM familia_miembros LIMIT 1;`

- [ ] **Step 4: Commit**

```bash
git add migrations/2026-04-15-familias-members.sql
git commit -m "feat: add familia_miembros table for member management"
```

---

### Task 2: Write tests for member CRUD operations

**Files:**
- Create: `server/familias-members.test.ts`
- Modify: `server/routers/familias.ts` (add member procedures)

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createTRPCMsw } from 'trpc-msw';
import { appRouter } from './routers';

describe('Member Management', () => {
  it('should get family members', async () => {
    const result = await appRouter.createCaller({}).familias.getMembers({
      familiaId: 'test-familia-id'
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('should add a member to family', async () => {
    const result = await appRouter.createCaller({}).familias.addMember({
      familiaId: 'test-familia-id',
      nombre: 'Juan García',
      rol: 'head_of_household',
      relacion: 'parent',
      estado: 'activo'
    });
    expect(result.id).toBeDefined();
    expect(result.nombre).toBe('Juan García');
  });

  it('should update a member', async () => {
    const result = await appRouter.createCaller({}).familias.updateMember({
      id: 'member-id',
      nombre: 'Juan García Updated',
      rol: 'dependent',
      relacion: 'child',
      estado: 'activo'
    });
    expect(result.nombre).toBe('Juan García Updated');
  });

  it('should delete a member', async () => {
    const result = await appRouter.createCaller({}).familias.deleteMember({
      id: 'member-id'
    });
    expect(result.success).toBe(true);
  });

  it('should validate required fields', async () => {
    expect(() => {
      appRouter.createCaller({}).familias.addMember({
        familiaId: 'test-familia-id',
        nombre: '', // Invalid: empty
        rol: 'head_of_household'
      });
    }).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server/familias-members.test.ts`
Expected: FAIL (procedures not defined)

- [ ] **Step 3: Implement member procedures in familias router**

Add to `server/routers/familias.ts`:

```typescript
// Get family members
getMembers: publicProcedure
  .input(z.object({ familiaId: z.string().uuid() }))
  .query(async ({ input }) => {
    const db = createAdminClient();
    const { data, error } = await db
      .from('familia_miembros')
      .select('*')
      .eq('familia_id', input.familiaId)
      .order('created_at', { ascending: true });
    
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return data || [];
  }),

// Add member
addMember: protectedProcedure
  .input(z.object({
    familiaId: z.string().uuid(),
    nombre: z.string().min(1),
    rol: z.enum(['head_of_household', 'dependent', 'other']),
    relacion: z.enum(['parent', 'child', 'sibling', 'other']).optional(),
    estado: z.enum(['activo', 'inactivo']).default('activo'),
    fechaNacimiento: z.string().date().optional()
  }))
  .mutation(async ({ input, ctx }) => {
    const db = createAdminClient();
    const { data, error } = await db
      .from('familia_miembros')
      .insert({
        familia_id: input.familiaId,
        nombre: input.nombre,
        rol: input.rol,
        relacion: input.relacion,
        estado: input.estado,
        fecha_nacimiento: input.fechaNacimiento
      })
      .select()
      .single();
    
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return data;
  }),

// Update member
updateMember: protectedProcedure
  .input(z.object({
    id: z.string().uuid(),
    nombre: z.string().min(1).optional(),
    rol: z.enum(['head_of_household', 'dependent', 'other']).optional(),
    relacion: z.enum(['parent', 'child', 'sibling', 'other']).optional(),
    estado: z.enum(['activo', 'inactivo']).optional(),
    fechaNacimiento: z.string().date().optional()
  }))
  .mutation(async ({ input, ctx }) => {
    const db = createAdminClient();
    const { data, error } = await db
      .from('familia_miembros')
      .update({
        ...(input.nombre && { nombre: input.nombre }),
        ...(input.rol && { rol: input.rol }),
        ...(input.relacion && { relacion: input.relacion }),
        ...(input.estado && { estado: input.estado }),
        ...(input.fechaNacimiento && { fecha_nacimiento: input.fechaNacimiento }),
        updated_at: new Date().toISOString()
      })
      .eq('id', input.id)
      .select()
      .single();
    
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return data;
  }),

// Delete member
deleteMember: protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    const db = createAdminClient();
    const { error } = await db
      .from('familia_miembros')
      .delete()
      .eq('id', input.id);
    
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return { success: true };
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- server/familias-members.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/familias-members.test.ts server/routers/familias.ts
git commit -m "feat: implement member CRUD procedures with tests"
```

---

### Task 3: Create MemberManagementModal component

**Files:**
- Create: `client/src/features/families/components/MemberManagementModal.tsx`

- [ ] **Step 1: Write component with tests**

```typescript
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';

interface MemberManagementModalProps {
  familiaId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function MemberManagementModal({ familiaId, isOpen, onClose }: MemberManagementModalProps) {
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', rol: 'dependent' as const });

  const { data: members, refetch } = trpc.familias.getMembers.useQuery({ familiaId });
  const addMemberMutation = trpc.familias.addMember.useMutation();
  const deleteMemberMutation = trpc.familias.deleteMember.useMutation();

  const handleAddMember = async () => {
    if (!formData.nombre) return;
    
    await addMemberMutation.mutateAsync({
      familiaId,
      nombre: formData.nombre,
      rol: formData.rol,
      estado: 'activo'
    });
    
    setFormData({ nombre: '', rol: 'dependent' });
    setIsAddingMember(false);
    refetch();
  };

  const handleDeleteMember = async (memberId: string) => {
    await deleteMemberMutation.mutateAsync({ id: memberId });
    refetch();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gestionar Miembros de la Familia</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Members List */}
          <div className="space-y-2">
            {members?.map((member) => (
              <div key={member.id} className="flex justify-between items-center p-2 border rounded">
                <div>
                  <p className="font-medium">{member.nombre}</p>
                  <p className="text-sm text-gray-600">{member.rol}</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteMember(member.id)}
                >
                  Eliminar
                </Button>
              </div>
            ))}
          </div>

          {/* Add Member Form */}
          {isAddingMember && (
            <div className="space-y-2 p-2 border rounded bg-gray-50">
              <Input
                placeholder="Nombre del miembro"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              />
              <Select value={formData.rol} onValueChange={(rol) => setFormData({ ...formData, rol: rol as any })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="head_of_household">Jefe de Hogar</SelectItem>
                  <SelectItem value="dependent">Dependiente</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button onClick={handleAddMember} disabled={!formData.nombre}>
                  Guardar
                </Button>
                <Button variant="outline" onClick={() => setIsAddingMember(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {!isAddingMember && (
            <Button onClick={() => setIsAddingMember(true)} className="w-full">
              + Agregar Miembro
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add component to FamiliaDetalle.tsx**

Modify `client/src/pages/FamiliaDetalle.tsx`:

```typescript
import { MemberManagementModal } from '@/features/families/components/MemberManagementModal';

export function FamiliaDetalle() {
  const [showMemberModal, setShowMemberModal] = useState(false);
  // ... rest of component

  return (
    <div>
      {/* ... existing content ... */}
      
      <Button onClick={() => setShowMemberModal(true)}>
        Editar Miembros
      </Button>

      <MemberManagementModal
        familiaId={familiaId}
        isOpen={showMemberModal}
        onClose={() => setShowMemberModal(false)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Test component in browser**

Navigate to family detail page, click "Editar Miembros", verify:
- Members list displays
- Can add new member
- Can delete member
- Changes persist

- [ ] **Step 4: Commit**

```bash
git add client/src/features/families/components/MemberManagementModal.tsx
git add client/src/pages/FamiliaDetalle.tsx
git commit -m "feat: add member management modal to family detail"
```

---

## Phase 2: Document Upload Management

### Task 4: Create document upload tables migration

**Files:**
- Create: `migrations/2026-04-15-familias-documents.sql`

- [ ] **Step 1: Write migration SQL**

```sql
CREATE TABLE IF NOT EXISTS documento_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  documento_tipo TEXT NOT NULL CHECK (documento_tipo IN ('dni', 'pasaporte', 'otro')),
  file_url TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_size INT,
  file_type TEXT,
  uploaded_by INT NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_current BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS documento_upload_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES documento_uploads(id) ON DELETE CASCADE,
  uploaded_by INT NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action TEXT CHECK (action IN ('upload', 'delete', 'replace')),
  notes TEXT
);

CREATE INDEX idx_documento_uploads_persona_id ON documento_uploads(persona_id);
CREATE INDEX idx_documento_uploads_is_current ON documento_uploads(is_current);
CREATE INDEX idx_documento_upload_history_documento_id ON documento_upload_history(documento_id);
```

- [ ] **Step 2: Apply migration**

Run: `manus-mcp-cli tool call apply_migration --server supabase --input '{"sql": "...migration content..."}'`

- [ ] **Step 3: Commit**

```bash
git add migrations/2026-04-15-familias-documents.sql
git commit -m "feat: add documento_uploads and history tables"
```

---

### Task 5: Implement document upload procedures

**Files:**
- Modify: `server/routers/familias.ts`

- [ ] **Step 1: Add document procedures**

```typescript
// Get document status
getDocumentoStatus: publicProcedure
  .input(z.object({ personaId: z.string().uuid() }))
  .query(async ({ input }) => {
    const db = createAdminClient();
    const { data, error } = await db
      .from('documento_uploads')
      .select('*')
      .eq('persona_id', input.personaId)
      .eq('is_current', true)
      .maybeSingle();
    
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return { hasDocument: !!data, documento: data };
  }),

// Upload document
uploadDocumento: protectedProcedure
  .input(z.object({
    personaId: z.string().uuid(),
    file: z.instanceof(File),
    documentoTipo: z.enum(['dni', 'pasaporte', 'otro'])
  }))
  .mutation(async ({ input, ctx }) => {
    const { storagePut } = await import('@/server/storage');
    
    // Upload to S3
    const fileBuffer = await input.file.arrayBuffer();
    const { url, key } = await storagePut(
      `documentos/${input.personaId}/${input.documentoTipo}-${Date.now()}.pdf`,
      Buffer.from(fileBuffer),
      'application/pdf'
    );

    // Mark previous as not current
    const db = createAdminClient();
    await db
      .from('documento_uploads')
      .update({ is_current: false })
      .eq('persona_id', input.personaId)
      .eq('is_current', true);

    // Insert new document
    const { data, error } = await db
      .from('documento_uploads')
      .insert({
        persona_id: input.personaId,
        documento_tipo: input.documentoTipo,
        file_url: url,
        file_key: key,
        file_size: input.file.size,
        file_type: input.file.type,
        uploaded_by: ctx.user?.id,
        is_current: true
      })
      .select()
      .single();

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return data;
  }),

// Get upload history
getDocumentoHistory: publicProcedure
  .input(z.object({ personaId: z.string().uuid() }))
  .query(async ({ input }) => {
    const db = createAdminClient();
    const { data, error } = await db
      .from('documento_upload_history')
      .select('*, users(name, email)')
      .eq('documento_id', input.personaId)
      .order('uploaded_at', { ascending: false });
    
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return data || [];
  })
```

- [ ] **Step 2: Test procedures**

Run: `npm test -- server/familias.test.ts -t "documento"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/routers/familias.ts
git commit -m "feat: add document upload procedures with S3 integration"
```

---

### Task 6: Create DocumentUploadModal component

**Files:**
- Create: `client/src/features/families/components/DocumentUploadModal.tsx`

- [ ] **Step 1: Write component**

```typescript
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';

interface DocumentUploadModalProps {
  personaId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentUploadModal({ personaId, isOpen, onClose }: DocumentUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [documentoTipo, setDocumentoTipo] = useState<'dni' | 'pasaporte' | 'otro'>('dni');

  const { data: status, refetch } = trpc.familias.getDocumentoStatus.useQuery({ personaId });
  const { data: history } = trpc.familias.getDocumentoHistory.useQuery({ personaId });
  const uploadMutation = trpc.familias.uploadDocumento.useMutation();

  const handleUpload = async () => {
    if (!file) return;
    
    await uploadMutation.mutateAsync({
      personaId,
      file,
      documentoTipo
    });
    
    setFile(null);
    refetch();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gestionar Documentos</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Section */}
          <div className="border-2 border-dashed rounded-lg p-4">
            <Input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              accept=".pdf,.jpg,.png"
            />
            <select
              value={documentoTipo}
              onChange={(e) => setDocumentoTipo(e.target.value as any)}
              className="mt-2 p-2 border rounded"
            >
              <option value="dni">DNI</option>
              <option value="pasaporte">Pasaporte</option>
              <option value="otro">Otro</option>
            </select>
            <Button onClick={handleUpload} disabled={!file} className="mt-2">
              Subir Documento
            </Button>
          </div>

          {/* Current Document */}
          {status?.documento && (
            <div className="p-3 bg-green-50 border border-green-200 rounded">
              <p className="font-medium text-green-900">Documento Actual</p>
              <p className="text-sm text-green-700">{status.documento.documento_tipo}</p>
              <p className="text-xs text-green-600">
                Subido: {new Date(status.documento.uploaded_at).toLocaleDateString()}
              </p>
            </div>
          )}

          {/* Upload History */}
          <div>
            <h3 className="font-medium mb-2">Historial de Subidas</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {history?.map((item) => (
                <div key={item.id} className="text-sm p-2 border rounded">
                  <p className="font-medium">{item.action}</p>
                  <p className="text-gray-600">{item.uploaded_by}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(item.uploaded_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Integrate into FamiliaDetalle**

- [ ] **Step 3: Test in browser**

- [ ] **Step 4: Commit**

```bash
git add client/src/features/families/components/DocumentUploadModal.tsx
git commit -m "feat: add document upload modal with history tracking"
```

---

## Phase 3: Social Reports & Delivery Management

### Task 7: Create social reports and delivery tables

**Files:**
- Create: `migrations/2026-04-15-familias-reports.sql`
- Create: `migrations/2026-04-15-familias-entregas.sql`

- [ ] **Step 1: Write migrations**

```sql
-- Social Reports
CREATE TABLE IF NOT EXISTS familia_informes_sociales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES familias(id) ON DELETE CASCADE,
  assessment_text TEXT,
  observations TEXT,
  recommendations TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'archived')),
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deliveries
CREATE TABLE IF NOT EXISTS familia_entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES familias(id) ON DELETE CASCADE,
  fecha_entrega DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('alimentos', 'suministros', 'otro')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'archived')),
  notas TEXT,
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Delivery Files
CREATE TABLE IF NOT EXISTS entrega_archivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id UUID NOT NULL REFERENCES familia_entregas(id) ON DELETE CASCADE,
  archivo_tipo TEXT NOT NULL CHECK (archivo_tipo IN ('foto', 'consentimiento')),
  file_url TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT,
  uploaded_by INT NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_familia_informes_familia_id ON familia_informes_sociales(familia_id);
CREATE INDEX idx_familia_entregas_familia_id ON familia_entregas(familia_id);
CREATE INDEX idx_entrega_archivos_entrega_id ON entrega_archivos(entrega_id);
```

- [ ] **Step 2: Apply migrations**

- [ ] **Step 3: Commit**

```bash
git add migrations/2026-04-15-familias-reports.sql
git add migrations/2026-04-15-familias-entregas.sql
git commit -m "feat: add social reports and delivery tables"
```

---

### Task 8: Implement social reports and delivery procedures

**Files:**
- Modify: `server/routers/familias.ts`

- [ ] **Step 1: Add procedures** (similar pattern to member management)

- [ ] **Step 2: Write tests**

- [ ] **Step 3: Commit**

---

### Task 9: Create SocialReportPanel and DeliveryPhotosPanel components

**Files:**
- Create: `client/src/features/families/components/SocialReportPanel.tsx`
- Create: `client/src/features/families/components/DeliveryPhotosPanel.tsx`

- [ ] **Step 1-4: Implement components** (similar to DocumentUploadModal)

- [ ] **Step 5: Commit**

---

## Phase 4: Batch Import/Export

### Task 10: Implement CSV export functionality

**Files:**
- Create: `server/familias-import-export.ts`
- Modify: `server/routers/familias.ts`

- [ ] **Step 1: Write CSV generation utilities**

```typescript
// server/familias-import-export.ts
export async function generateFamiliesCSV(
  mode: 'update' | 'audit' | 'verify',
  familias: any[]
) {
  const headers = getHeadersForMode(mode);
  const rows = familias.map(f => formatRowForMode(f, mode));
  
  const csv = [
    headers.join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');
  
  return csv;
}

function getHeadersForMode(mode: string): string[] {
  const allHeaders = [
    'familia_id', 'nombre_familia', 'contacto_principal', 'telefono', 'direccion',
    'miembros_count', 'estado', 'fecha_creacion', 'compliance_status', ...
  ];
  
  if (mode === 'verify') return ['familia_id', 'nombre_familia', 'estado'];
  if (mode === 'audit') return allHeaders.slice(0, 10);
  return allHeaders; // update mode
}
```

- [ ] **Step 2: Add export procedure**

```typescript
exportFamilias: publicProcedure
  .input(z.object({
    mode: z.enum(['update', 'audit', 'verify']),
    familiaIds: z.array(z.string().uuid()).optional()
  }))
  .query(async ({ input }) => {
    // Fetch families
    // Generate CSV
    // Return download URL
  })
```

- [ ] **Step 3: Test export**

- [ ] **Step 4: Commit**

---

### Task 11: Implement CSV import functionality

**Files:**
- Modify: `server/familias-import-export.ts`
- Modify: `server/routers/familias.ts`

- [ ] **Step 1: Write CSV parsing utilities**

```typescript
export async function parseFamiliesCSV(csvContent: string) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
  
  return { headers, rows };
}

export async function validateFamiliesData(rows: any[]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  rows.forEach((row, idx) => {
    if (!row.nombre_familia) errors.push(`Row ${idx}: Missing nombre_familia`);
    if (!row.familia_id) warnings.push(`Row ${idx}: No familia_id, will create new`);
  });
  
  return { errors, warnings, isValid: errors.length === 0 };
}
```

- [ ] **Step 2: Add import procedure**

```typescript
importFamilias: adminProcedure
  .input(z.object({
    csvContent: z.string(),
    mergeStrategy: z.enum(['overwrite', 'merge', 'skip']).default('merge')
  }))
  .mutation(async ({ input, ctx }) => {
    // Parse CSV
    // Validate data
    // Perform batch upsert
    // Return import summary
  })
```

- [ ] **Step 3: Test import**

- [ ] **Step 4: Commit**

---

### Task 12: Create import/export modals

**Files:**
- Create: `client/src/features/families/components/ExportFamiliesModal.tsx`
- Create: `client/src/features/families/components/ImportFamiliesModal.tsx`

- [ ] **Step 1-4: Implement modals**

- [ ] **Step 5: Commit**

---

## Phase 5: Integration & Testing

### Task 13: Add all modals to FamiliasList

**Files:**
- Modify: `client/src/pages/FamiliasList.tsx`

- [ ] **Step 1: Add buttons for import/export**

- [ ] **Step 2: Wire up modals**

- [ ] **Step 3: Test end-to-end**

- [ ] **Step 4: Commit**

---

### Task 14: Write integration tests

**Files:**
- Create: `client/src/features/families/__tests__/integration.test.ts`

- [ ] **Step 1: Write E2E test scenarios**

- [ ] **Step 2: Run tests**

- [ ] **Step 3: Commit**

---

### Task 15: Final verification and documentation

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Manual testing checklist**

- [ ] Member management works
- [ ] Document uploads tracked
- [ ] Social reports created
- [ ] Deliveries managed
- [ ] CSV export/import works
- [ ] Audit trails complete

- [ ] **Step 3: Update README with new features**

- [ ] **Step 4: Final commit**

```bash
git add docs/
git commit -m "docs: add familias improvements documentation"
```

---

## Success Criteria

- ✅ All 15 tasks completed
- ✅ All tests passing (373 → 400+)
- ✅ No TypeScript errors
- ✅ All features working in browser
- ✅ Audit trails complete
- ✅ CSV import/export validated
- ✅ Code reviewed and approved

---

## Notes

- Use TDD throughout: write tests first, implement second
- Commit after each task
- Run `npm test` before each commit
- Keep components focused and reusable
- Follow existing code patterns
- Use S3 for all file uploads
- Track all user actions in audit tables

