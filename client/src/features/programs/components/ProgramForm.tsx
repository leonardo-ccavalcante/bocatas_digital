import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ProgramFormSchema, ProgramFormValues, CONSENT_PURPOSES, type Program } from "../schemas";
import { slugFromName } from "../utils/slugFromName";

interface ProgramFormProps {
  defaultValues?: Partial<ProgramFormValues>;
  isEditing?: boolean;
  isLoading?: boolean;
  onSubmit: (values: ProgramFormValues) => void;
  onCancel?: () => void;
}

export function ProgramForm({
  defaultValues,
  isEditing = false,
  isLoading = false,
  onSubmit,
  onCancel,
}: ProgramFormProps) {
  const form = useForm<ProgramFormValues>({
    // tRPC error boundary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(ProgramFormSchema) as any,
    defaultValues: {
      slug: "",
      name: "",
      description: "",
      icon: "🏠",
      is_default: false,
      is_active: true,
      display_order: 99,
      volunteer_can_access: true,
      volunteer_can_write: true,
      volunteer_visible_fields: [],
      requires_consents: [],
      fecha_inicio: null,
      fecha_fin: null,
      config: {},
      responsable_id: null,
      ...defaultValues,
    },
  });

  const nameValue = form.watch("name");

  // Auto-generate slug from name (only when creating)
  useEffect(() => {
    if (!isEditing && nameValue) {
      form.setValue("slug", slugFromName(nameValue), { shouldValidate: true });
    }
  }, [nameValue, isEditing, form]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Información básica
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del programa *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Comedor Social" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="icon"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Icono (emoji)</FormLabel>
                  <FormControl>
                    <Input placeholder="🏠" maxLength={4} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Identificador (slug) *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="comedor_social"
                    {...field}
                    disabled={isEditing}
                    className="font-mono text-sm"
                  />
                </FormControl>
                <FormDescription>
                  Solo letras minúsculas y guiones bajos. {isEditing ? "No se puede cambiar." : "Se genera automáticamente."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Describe brevemente el programa..."
                    rows={3}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="fecha_inicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de inicio</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fecha_fin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de fin</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="display_order"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Orden de visualización</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                  />
                </FormControl>
                <FormDescription>Número menor = aparece primero (1–99)</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Access & Visibility */}
        <div className="space-y-4 border-t pt-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Acceso y visibilidad
          </h3>

          <div className="space-y-3">
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium">Programa activo</FormLabel>
                    <FormDescription className="text-xs">
                      Los programas inactivos no aparecen en el check-in
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_default"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium">Programa por defecto</FormLabel>
                    <FormDescription className="text-xs">
                      Se selecciona automáticamente en el check-in
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="volunteer_can_access"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium">Voluntarios pueden ver este programa</FormLabel>
                    <FormDescription className="text-xs">
                      Los voluntarios pueden ver inscripciones en este programa
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="volunteer_can_write"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium">Voluntarios pueden inscribir personas</FormLabel>
                    <FormDescription className="text-xs">
                      Permite a los voluntarios inscribir personas en este programa
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={!form.watch("volunteer_can_access")}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <p className="text-xs text-muted-foreground mt-1">
              ⚠ Los campos sensibles (documento, situación legal, etc.) siempre están bloqueados por la base de datos.
            </p>
          </div>
        </div>

        {/* Consent Requirements */}
        <div className="space-y-4 border-t pt-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Consentimientos requeridos
          </h3>
          <p className="text-xs text-muted-foreground">
            Al inscribir a una persona, se verificará que tenga estos consentimientos firmados (no bloquea la inscripción, pero muestra advertencia).
          </p>

          <FormField
            control={form.control}
            name="requires_consents"
            render={({ field }) => (
              <FormItem>
                <div className="space-y-2">
                  {CONSENT_PURPOSES.map((purpose) => (
                    <div key={purpose.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`consent-${purpose.value}`}
                        checked={field.value?.includes(purpose.value)}
                        onCheckedChange={(checked) => {
                          const current = field.value ?? [];
                          if (checked) {
                            field.onChange([...current, purpose.value]);
                          } else {
                            field.onChange(current.filter((v) => v !== purpose.value));
                          }
                        }}
                      />
                      <Label
                        htmlFor={`consent-${purpose.value}`}
                        className="text-sm cursor-pointer"
                      >
                        {purpose.label}
                      </Label>
                    </div>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Session Close Config */}
        <div className="space-y-4 border-t pt-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Cierre de sesión
          </h3>
          <p className="text-xs text-muted-foreground">
            Configura cómo se registra el cierre de cada sesión de entrega de este programa.
          </p>
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-medium">Campos predeterminados del sistema:</p>
            <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
              <li>Familias atendidas (obligatorio)</li>
              <li>Kg totales distribuidos (obligatorio)</li>
              <li>Incidencias / observaciones</li>
              <li>Voluntarios presentes</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-2">
              Para personalizar los campos, contacta con el administrador del sistema.
            </p>
          </div>
        </div>
        {/* Actions */}
        <div className="flex justify-end gap-3 border-t pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear programa"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
