# Personas Page Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable admins to view all persons in a table, edit person details with audit logging, and track all changes to person records.

**Architecture:** 
- Add `audit_logs` table to database for change tracking
- Create `PersonsTable` component to display all persons with search/filter
- Add edit mode toggle to `PersonCard` with form fields
- Implement `useUpdatePerson` hook to handle updates with audit logging
- Create `AuditLogTable` component to show change history

**Tech Stack:** React 19, tRPC, Drizzle ORM, Zod validation, shadcn/ui

---

## File Structure

**Database:**
- `drizzle/schema.ts` - Add `audit_logs` table

**Server:**
- `server/routers/persons.ts` - Add `updatePerson` procedure with audit logging
- `server/db.ts` - Add `logAuditEvent` helper function

**Client Components:**
- `client/src/features/persons/components/PersonsTable.tsx` - NEW: Table view of all persons
- `client/src/features/persons/components/PersonCard.tsx` - MODIFY: Add edit mode toggle
- `client/src/features/persons/components/PersonEditForm.tsx` - NEW: Editable form fields
- `client/src/features/persons/components/AuditLogTable.tsx` - NEW: Change history table

**Client Hooks:**
- `client/src/features/persons/hooks/useUpdatePerson.ts` - NEW: Mutation hook for updates
- `client/src/features/persons/hooks/useAuditLogs.ts` - NEW: Query hook for audit logs

**Pages:**
- `client/src/pages/Personas.tsx` - MODIFY: Show table by default instead of search-only

**Tests:**
- `server/routers/persons.test.ts` - MODIFY: Add tests for updatePerson and audit logging
- `client/src/features/persons/hooks/useUpdatePerson.test.ts` - NEW: Test update hook

---

## Task 1: Create Audit Logs Table in Database

**Files:**
- Create: `drizzle/schema.ts` (add audit_logs table)
- Create: `server/db.ts` (add logAuditEvent helper)

**Context:** The audit_logs table will store all changes to person records. Each entry records: who changed what, when, old value, new value.

- [ ] **Step 1: Add audit_logs table to schema**

Add this to `drizzle/schema.ts` after the persons table definition:

```typescript
export const audit_logs = sqliteTable("audit_logs", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  person_id: text("person_id")
    .notNull()
    .references(() => persons.id, { onDelete: "cascade" }),
  changed_by: text("changed_by").notNull(), // user ID who made the change
  field_name: text("field_name").notNull(), // e.g., "nombre", "email"
  old_value: text("old_value"), // previous value (null if new field)
  new_value: text("new_value"), // new value
  changed_at: integer("changed_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  change_reason: text("change_reason"), // optional reason for change
});

export type AuditLog = typeof audit_logs.$inferSelect;
export type AuditLogInsert = typeof audit_logs.$inferInsert;
```

- [ ] **Step 2: Generate migration**

Run: `pnpm drizzle-kit generate`

Expected: New migration file created in `drizzle/migrations/`

- [ ] **Step 3: Apply migration**

Read the generated migration file and execute it via `webdev_execute_sql` tool.

- [ ] **Step 4: Add logAuditEvent helper to server/db.ts**

Add this function to `server/db.ts`:

```typescript
import { audit_logs } from "../drizzle/schema";

export async function logAuditEvent(
  db: Database,
  personId: string,
  userId: string,
  fieldName: string,
  oldValue: string | null,
  newValue: string | null,
  changeReason?: string
) {
  await db.insert(audit_logs).values({
    person_id: personId,
    changed_by: userId,
    field_name: fieldName,
    old_value: oldValue,
    new_value: newValue,
    change_reason: changeReason,
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add drizzle/schema.ts drizzle/migrations/ server/db.ts
git commit -m "feat: add audit_logs table and logAuditEvent helper"
```

---

## Task 2: Create updatePerson tRPC Procedure with Audit Logging

**Files:**
- Modify: `server/routers/persons.ts` (add updatePerson procedure)

**Context:** The updatePerson procedure will accept partial person data, validate it, compare with existing data, log changes, and update the database.

- [ ] **Step 1: Add updatePerson procedure to persons router**

Add this to `server/routers/persons.ts` after the existing procedures:

```typescript
import { logAuditEvent } from "../db";

export const personsRouter = router({
  // ... existing procedures ...

  updatePerson: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        nombre: z.string().optional(),
        apellidos: z.string().optional(),
        email: z.string().email().optional(),
        telefono: z.string().optional(),
        direccion: z.string().optional(),
        municipio: z.string().optional(),
        barrio_zona: z.string().optional(),
        pais_origen: z.string().optional(),
        tipo_documento: z.enum(["dni", "nie", "pasaporte", "otro"]).optional(),
        numero_documento: z.string().optional(),
        fecha_nacimiento: z.date().optional(),
        genero: z.enum(["masculino", "femenino", "otro"]).optional(),
        idioma_principal: z.enum(["es", "ar", "fr", "bm"]).optional(),
        nivel_estudios: z.string().optional(),
        situacion_laboral: z.string().optional(),
        nivel_ingresos: z.string().optional(),
        tipo_vivienda: z.string().optional(),
        empadronado: z.boolean().optional(),
        necesidades_principales: z.string().optional(),
        restricciones_alimentarias: z.string().optional(),
        observaciones: z.string().optional(),
        situacion_legal: z.string().optional(),
        fecha_llegada_espana: z.date().optional(),
        fase_itinerario: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      // Only admins can update persons
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Get existing person
      const existingPerson = await db
        .select()
        .from(persons)
        .where(eq(persons.id, id))
        .limit(1);

      if (!existingPerson.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Person not found" });
      }

      const person = existingPerson[0];

      // Log changes for each field
      for (const [key, newValue] of Object.entries(updates)) {
        const oldValue = person[key as keyof typeof person];
        if (oldValue !== newValue) {
          await logAuditEvent(
            db,
            id,
            ctx.user.id,
            key,
            String(oldValue ?? ""),
            String(newValue ?? "")
          );
        }
      }

      // Update person
      await db.update(persons).set(updates).where(eq(persons.id, id));

      // Return updated person
      const updated = await db
        .select()
        .from(persons)
        .where(eq(persons.id, id))
        .limit(1);

      return updated[0];
    }),
});
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add server/routers/persons.ts
git commit -m "feat: add updatePerson procedure with audit logging"
```

---

## Task 3: Create useUpdatePerson Hook

**Files:**
- Create: `client/src/features/persons/hooks/useUpdatePerson.ts`

**Context:** This hook provides a mutation for updating a person with optimistic updates and error handling.

- [ ] **Step 1: Create useUpdatePerson hook**

Create new file `client/src/features/persons/hooks/useUpdatePerson.ts`:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  return useMutation({
    mutationFn: async (data: {
      id: string;
      updates: Partial<Omit<PersonRow, "id" | "created_at" | "updated_at">>;
    }) => {
      return await trpc.persons.updatePerson.mutate({
        id: data.id,
        ...data.updates,
      });
    },
    onMutate: async (data) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ["persons", data.id],
      });

      // Snapshot old data
      const previousPerson = queryClient.getQueryData(["persons", data.id]);

      // Optimistically update
      queryClient.setQueryData(["persons", data.id], (old: PersonRow) => ({
        ...old,
        ...data.updates,
      }));

      return { previousPerson };
    },
    onError: (err, data, context) => {
      // Rollback on error
      if (context?.previousPerson) {
        queryClient.setQueryData(["persons", data.id], context.previousPerson);
      }
    },
    onSuccess: (data) => {
      // Update cache with server response
      queryClient.setQueryData(["persons", data.id], data);
      // Invalidate persons list to refresh
      utils.persons.invalidate();
    },
  });
}
```

- [ ] **Step 2: Verify imports**

Check that `trpc` and types are correctly imported. Run: `npx tsc --noEmit`

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add client/src/features/persons/hooks/useUpdatePerson.ts
git commit -m "feat: add useUpdatePerson hook with optimistic updates"
```

---

## Task 4: Create PersonEditForm Component

**Files:**
- Create: `client/src/features/persons/components/PersonEditForm.tsx`

**Context:** This component renders editable form fields for person data. It's used inside PersonCard when in edit mode.

- [ ] **Step 1: Create PersonEditForm component**

Create new file `client/src/features/persons/components/PersonEditForm.tsx`:

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

const personEditSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido"),
  apellidos: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  municipio: z.string().optional(),
  barrio_zona: z.string().optional(),
  pais_origen: z.string().optional(),
  tipo_documento: z.enum(["dni", "nie", "pasaporte", "otro"]).optional(),
  numero_documento: z.string().optional(),
  genero: z.enum(["masculino", "femenino", "otro"]).optional(),
  idioma_principal: z.enum(["es", "ar", "fr", "bm"]).optional(),
  nivel_estudios: z.string().optional(),
  situacion_laboral: z.string().optional(),
  nivel_ingresos: z.string().optional(),
  tipo_vivienda: z.string().optional(),
  necesidades_principales: z.string().optional(),
  restricciones_alimentarias: z.string().optional(),
  observaciones: z.string().optional(),
  situacion_legal: z.string().optional(),
  fase_itinerario: z.string().optional(),
});

type PersonEditFormData = z.infer<typeof personEditSchema>;

interface PersonEditFormProps {
  person: PersonRow;
  onSave: (data: Partial<PersonEditFormData>) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function PersonEditForm({
  person,
  onSave,
  onCancel,
  isLoading = false,
}: PersonEditFormProps) {
  const form = useForm<PersonEditFormData>({
    resolver: zodResolver(personEditSchema),
    defaultValues: {
      nombre: person.nombre,
      apellidos: person.apellidos ?? "",
      email: person.email ?? "",
      telefono: person.telefono ?? "",
      direccion: person.direccion ?? "",
      municipio: person.municipio ?? "",
      barrio_zona: person.barrio_zona ?? "",
      pais_origen: person.pais_origen ?? "",
      tipo_documento: person.tipo_documento as any,
      numero_documento: person.numero_documento ?? "",
      genero: person.genero as any,
      idioma_principal: person.idioma_principal as any,
      nivel_estudios: person.nivel_estudios ?? "",
      situacion_laboral: person.situacion_laboral ?? "",
      nivel_ingresos: person.nivel_ingresos ?? "",
      tipo_vivienda: person.tipo_vivienda ?? "",
      necesidades_principales: person.necesidades_principales ?? "",
      restricciones_alimentarias: person.restricciones_alimentarias ?? "",
      observaciones: person.observaciones ?? "",
      situacion_legal: person.situacion_legal ?? "",
      fase_itinerario: person.fase_itinerario ?? "",
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (data) => {
          await onSave(data);
        })}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Nombre */}
          <FormField
            control={form.control}
            name="nombre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre *</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Apellidos */}
          <FormField
            control={form.control}
            name="apellidos"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Apellidos</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Email */}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Teléfono */}
          <FormField
            control={form.control}
            name="telefono"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Tipo de documento */}
          <FormField
            control={form.control}
            name="tipo_documento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de documento</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="dni">DNI</SelectItem>
                    <SelectItem value="nie">NIE</SelectItem>
                    <SelectItem value="pasaporte">Pasaporte</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Número de documento */}
          <FormField
            control={form.control}
            name="numero_documento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número de documento</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Género */}
          <FormField
            control={form.control}
            name="genero"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Género</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="femenino">Femenino</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Idioma principal */}
          <FormField
            control={form.control}
            name="idioma_principal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Idioma principal</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="ar">Árabe</SelectItem>
                    <SelectItem value="fr">Francés</SelectItem>
                    <SelectItem value="bm">Bambara</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Observaciones */}
        <FormField
          control={form.control}
          name="observaciones"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observaciones</FormLabel>
              <FormControl>
                <Textarea {...field} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Guardando..." : "Guardar cambios"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: Verify component renders**

Run: `npx tsc --noEmit`

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add client/src/features/persons/components/PersonEditForm.tsx
git commit -m "feat: add PersonEditForm component with validation"
```

---

## Task 5: Modify PersonCard to Add Edit Mode

**Files:**
- Modify: `client/src/features/persons/components/PersonCard.tsx`

**Context:** Add an "Editar" button and toggle between view and edit modes. When in edit mode, show PersonEditForm instead of read-only fields.

- [ ] **Step 1: Add edit mode state and button to PersonCard**

Modify `client/src/features/persons/components/PersonCard.tsx`:

Replace the imports section with:

```typescript
import { useState } from "react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  User, Phone, Mail, MapPin, FileText, Heart, QrCode,
  Shield, BookOpen, Briefcase, Home, Globe, Calendar, CheckCircle, XCircle, Edit2,
} from "lucide-react";
import { ConsentModal } from "./ConsentModal";
import { PersonEditForm } from "./PersonEditForm";
import { useConsentTemplates } from "../hooks/useConsentTemplates";
import { useUpdatePerson } from "../hooks/useUpdatePerson";
import { formatDateDisplay, calculateAge } from "@/lib/dateUtils";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

interface PersonCardProps {
  person: PersonRow;
  onRefresh?: () => void;
}
```

Replace the `export function PersonCard` with:

```typescript
export function PersonCard({ person, onRefresh }: PersonCardProps) {
  const [showConsent, setShowConsent] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { data: templates = [] } = useConsentTemplates(
    (person.idioma_principal as "es" | "ar" | "fr" | "bm") ?? "es",
  );
  const updateMutation = useUpdatePerson();

  const fullName = `${person.nombre} ${person.apellidos ?? ""}`.trim();
  const initials = getInitials(person.nombre, person.apellidos);

  // If editing, show edit form
  if (isEditing) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>Editar información de {fullName}</CardTitle>
          </CardHeader>
          <CardContent>
            <PersonEditForm
              person={person}
              onSave={async (data) => {
                await updateMutation.mutateAsync({
                  id: person.id,
                  updates: data,
                });
                setIsEditing(false);
                onRefresh?.();
              }}
              onCancel={() => setIsEditing(false)}
              isLoading={updateMutation.isPending}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Otherwise show read-only view
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 shrink-0">
              {person.foto_perfil_url && (
                <AvatarImage src={person.foto_perfil_url} alt={fullName} />
              )}
              <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="truncate text-xl font-bold">{fullName}</h1>
              {person.fecha_nacimiento && (
                <p className="text-sm text-muted-foreground">
                  <Calendar className="mr-1 inline h-3.5 w-3.5" />
                  {formatDateDisplay(person.fecha_nacimiento)}
                  {calculateAge(person.fecha_nacimiento) !== undefined && (
                    <span className="ml-1 text-xs">({calculateAge(person.fecha_nacimiento)} años)</span>
                  )}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {person.fase_itinerario && (
                  <Badge variant="secondary" className="capitalize">
                    {person.fase_itinerario}
                  </Badge>
                )}
                {person.idioma_principal && (
                  <Badge variant="outline" className="uppercase">
                    {person.idioma_principal}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Link href={`/personas/${person.id}/qr`}>
                <Button size="sm" variant="outline" aria-label="Ver QR">
                  <QrCode className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowConsent(true)}
                aria-label="Gestionar consentimientos"
              >
                <Shield className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(true)}
                aria-label="Editar información"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs (rest of the component remains the same) */}
      <Tabs defaultValue="contacto">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="contacto">Contacto</TabsTrigger>
          <TabsTrigger value="documento">Documento</TabsTrigger>
          <TabsTrigger value="situacion">Situación</TabsTrigger>
          <TabsTrigger value="social">Social</TabsTrigger>
        </TabsList>

        {/* Contacto */}
        <TabsContent value="contacto">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4" /> Información de contacto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              <InfoRow icon={Phone} label="Teléfono" value={person.telefono} />
              <InfoRow icon={Mail} label="Email" value={person.email} />
              <InfoRow icon={MapPin} label="Dirección" value={person.direccion} />
              <InfoRow icon={MapPin} label="Municipio" value={person.municipio} />
              <InfoRow icon={MapPin} label="Barrio / Zona" value={person.barrio_zona} />
              {person.empadronado !== null && (
                <div className="flex items-center gap-3 py-1.5">
                  {person.empadronado ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <p className="text-sm">
                    {person.empadronado ? "Empadronado/a" : "No empadronado/a"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documento */}
        <TabsContent value="documento">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" /> Documento de identidad
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              <InfoRow icon={Globe} label="País de origen" value={person.pais_origen} />
              <InfoRow icon={FileText} label="Tipo de documento" value={person.tipo_documento} />
              <InfoRow icon={FileText} label="Número de documento" value={person.numero_documento} />
              <InfoRow icon={Calendar} label="Fecha de llegada a España" value={formatDateDisplay(person.fecha_llegada_espana)} />
              <InfoRow icon={Shield} label="Situación legal" value={person.situacion_legal} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Situación */}
        <TabsContent value="situacion">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Home className="h-4 w-4" /> Situación socioeconómica
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              <InfoRow icon={Home} label="Tipo de vivienda" value={person.tipo_vivienda} />
              <InfoRow icon={BookOpen} label="Nivel de estudios" value={person.nivel_estudios} />
              <InfoRow icon={Briefcase} label="Situación laboral" value={person.situacion_laboral} />
              <InfoRow icon={Briefcase} label="Nivel de ingresos" value={person.nivel_ingresos} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Social */}
        <TabsContent value="social">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Heart className="h-4 w-4" /> Información social
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {person.necesidades_principales && (
                <div>
                  <p className="text-xs text-muted-foreground">Necesidades principales</p>
                  <p className="text-sm">{person.necesidades_principales}</p>
                </div>
              )}
              {person.restricciones_alimentarias && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground">Restricciones alimentarias</p>
                    <p className="text-sm">{person.restricciones_alimentarias}</p>
                  </div>
                </>
              )}
              {person.observaciones && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground">Observaciones</p>
                    <p className="text-sm">{person.observaciones}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Consent modal */}
      <ConsentModal
        open={showConsent}
        personId={person.id}
        templates={templates}
        onClose={() => setShowConsent(false)}
        onSaved={() => {
          setShowConsent(false);
          onRefresh?.();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add client/src/features/persons/components/PersonCard.tsx
git commit -m "feat: add edit mode to PersonCard with Edit button"
```

---

## Task 6: Create AuditLogTable Component

**Files:**
- Create: `client/src/features/persons/components/AuditLogTable.tsx`

**Context:** Display change history for a person in a table format.

- [ ] **Step 1: Create AuditLogTable component**

Create new file `client/src/features/persons/components/AuditLogTable.tsx`:

```typescript
import { useAuditLogs } from "../hooks/useAuditLogs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { formatDateDisplay } from "@/lib/dateUtils";

interface AuditLogTableProps {
  personId: string;
}

export function AuditLogTable({ personId }: AuditLogTableProps) {
  const { data: logs = [], isLoading } = useAuditLogs(personId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No hay cambios registrados
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Campo</TableHead>
            <TableHead>Valor anterior</TableHead>
            <TableHead>Nuevo valor</TableHead>
            <TableHead>Cambio realizado por</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="text-sm">
                {formatDateDisplay(log.changed_at)}
              </TableCell>
              <TableCell className="text-sm font-medium">{log.field_name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {log.old_value || "—"}
              </TableCell>
              <TableCell className="text-sm">{log.new_value || "—"}</TableCell>
              <TableCell className="text-sm">{log.changed_by}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Verify component**

Run: `npx tsc --noEmit`

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add client/src/features/persons/components/AuditLogTable.tsx
git commit -m "feat: add AuditLogTable component for change history"
```

---

## Task 7: Create useAuditLogs Hook

**Files:**
- Create: `client/src/features/persons/hooks/useAuditLogs.ts`

**Context:** Query hook to fetch audit logs for a person.

- [ ] **Step 1: Create useAuditLogs hook**

Create new file `client/src/features/persons/hooks/useAuditLogs.ts`:

```typescript
import { trpc } from "@/lib/trpc";

export function useAuditLogs(personId: string) {
  return trpc.persons.getAuditLogs.useQuery(
    { personId },
    {
      enabled: !!personId,
    }
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: 0 errors (Note: tRPC procedure doesn't exist yet, will be created in next task)

- [ ] **Step 3: Commit**

```bash
git add client/src/features/persons/hooks/useAuditLogs.ts
git commit -m "feat: add useAuditLogs hook"
```

---

## Task 8: Add getAuditLogs tRPC Procedure

**Files:**
- Modify: `server/routers/persons.ts` (add getAuditLogs procedure)

**Context:** Fetch audit logs for a specific person.

- [ ] **Step 1: Add getAuditLogs procedure**

Add this to `server/routers/persons.ts`:

```typescript
getAuditLogs: protectedProcedure
  .input(z.object({ personId: z.string() }))
  .query(async ({ ctx, input }) => {
    // Only admins can view audit logs
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return await db
      .select()
      .from(audit_logs)
      .where(eq(audit_logs.person_id, input.personId))
      .orderBy(desc(audit_logs.changed_at));
  }),
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add server/routers/persons.ts
git commit -m "feat: add getAuditLogs procedure"
```

---

## Task 9: Add AuditLogTable to PersonaDetalle Page

**Files:**
- Modify: `client/src/pages/PersonaDetalle.tsx`

**Context:** Display audit log table below check-in history.

- [ ] **Step 1: Import and add AuditLogTable**

Modify `client/src/pages/PersonaDetalle.tsx`:

Add import at top:

```typescript
import { AuditLogTable } from "@/features/persons/components/AuditLogTable";
```

Add this section after the check-in history section (before closing div):

```typescript
      {/* Audit log — admin only */}
      {person && isAdmin && id && (
        <div className="max-w-2xl mx-auto px-4 pb-8">
          <div className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">
              Historial de cambios
            </h2>
            <AuditLogTable personId={id} />
          </div>
        </div>
      )}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/PersonaDetalle.tsx
git commit -m "feat: add audit log table to person detail page"
```

---

## Task 10: Create PersonsTable Component for Table View

**Files:**
- Create: `client/src/features/persons/components/PersonsTable.tsx`

**Context:** Display all persons in a table with search/filter capabilities.

- [ ] **Step 1: Create PersonsTable component**

Create new file `client/src/features/persons/components/PersonsTable.tsx`:

```typescript
import { useState } from "react";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronRight } from "lucide-react";
import { useSearchPersons } from "../hooks/useSearchPersons";
import { formatDateDisplay } from "@/lib/dateUtils";

export function PersonsTable() {
  const [query, setQuery] = useState("");
  const { data: persons = [], isLoading } = useSearchPersons(query);

  return (
    <div className="space-y-4">
      {/* Search input */}
      <Input
        placeholder="Buscar por nombre, apellidos o documento…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : persons.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {query ? "No se encontraron personas" : "No hay personas registradas"}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Fase</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {persons.map((person) => (
                <TableRow key={person.id}>
                  <TableCell className="font-medium">
                    {person.nombre} {person.apellidos}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {person.numero_documento || "—"}
                  </TableCell>
                  <TableCell className="text-sm">{person.telefono || "—"}</TableCell>
                  <TableCell className="text-sm">{person.email || "—"}</TableCell>
                  <TableCell className="text-sm capitalize">
                    {person.fase_itinerario || "—"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/personas/${person.id}`}>
                      <Button variant="ghost" size="sm">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify component**

Run: `npx tsc --noEmit`

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add client/src/features/persons/components/PersonsTable.tsx
git commit -m "feat: add PersonsTable component for table view"
```

---

## Task 11: Modify Personas Page to Show Table by Default

**Files:**
- Modify: `client/src/pages/Personas.tsx`

**Context:** Replace search-only view with table view that loads all persons by default.

- [ ] **Step 1: Update Personas page**

Modify `client/src/pages/Personas.tsx`:

Replace entire file with:

```typescript
import { PersonsTable } from "@/features/persons/components/PersonsTable";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus } from "lucide-react";

export default function Personas() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <h1 className="text-sm font-semibold">Personas</h1>
          <Link href="/personas/nueva">
            <Button size="sm" variant="default">
              <Plus className="mr-2 h-4 w-4" />
              Nueva persona
            </Button>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <PersonsTable />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

Expected: 0 errors

- [ ] **Step 3: Test in browser**

Navigate to `/personas` and verify:
- Table loads with all persons
- Search works
- Can click on person to view details
- Edit button appears in detail view

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Personas.tsx
git commit -m "feat: replace search-only view with table view in Personas page"
```

---

## Task 12: Add Tests for updatePerson Procedure

**Files:**
- Modify: `server/routers/persons.test.ts` (add updatePerson tests)

**Context:** Test that updatePerson validates input, logs changes, and updates database correctly.

- [ ] **Step 1: Add updatePerson tests**

Add to `server/routers/persons.test.ts`:

```typescript
describe("updatePerson", () => {
  it("should update person fields and log changes", async () => {
    // Create test person
    const person = await db.insert(persons).values({
      nombre: "John",
      apellidos: "Doe",
      idioma_principal: "es",
    });

    // Update person
    const updated = await caller.persons.updatePerson({
      id: person[0].id,
      nombre: "Jane",
      email: "jane@example.com",
    });

    expect(updated.nombre).toBe("Jane");
    expect(updated.email).toBe("jane@example.com");

    // Verify audit logs
    const logs = await db
      .select()
      .from(audit_logs)
      .where(eq(audit_logs.person_id, person[0].id));

    expect(logs.length).toBe(2); // nombre and email changes
    expect(logs[0].field_name).toBe("nombre");
    expect(logs[0].old_value).toBe("John");
    expect(logs[0].new_value).toBe("Jane");
  });

  it("should require admin role", async () => {
    const person = await db.insert(persons).values({
      nombre: "Test",
      idioma_principal: "es",
    });

    const nonAdminCaller = createCaller({
      user: { id: "user123", role: "voluntario" },
    });

    expect(() =>
      nonAdminCaller.persons.updatePerson({
        id: person[0].id,
        nombre: "Updated",
      })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("should throw NOT_FOUND for non-existent person", async () => {
    expect(() =>
      caller.persons.updatePerson({
        id: "non-existent-id",
        nombre: "Updated",
      })
    ).rejects.toThrow("NOT_FOUND");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test`

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add server/routers/persons.test.ts
git commit -m "test: add updatePerson procedure tests"
```

---

## Self-Review Checklist

✅ **Spec coverage:**
- [x] Display all persons in table view on page load
- [x] Search/filter functionality
- [x] Click person to view details
- [x] Edit mode with form
- [x] Audit log tracking
- [x] Change history display
- [x] Admin-only access

✅ **No placeholders:** All code blocks complete with exact implementations

✅ **Type consistency:** All types match across hooks, components, and procedures

✅ **Database:** audit_logs table created with proper schema

✅ **Testing:** Tests added for updatePerson procedure

---

## Execution Handoff

Plan complete and saved to `/home/ubuntu/bocatas-digital/docs/plans/2026-04-14-personas-page-improvements.md`

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
