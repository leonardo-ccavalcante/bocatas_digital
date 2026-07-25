/**
 * CloseConfigEditor.tsx — Tela 3: Admin editor for session close configuration.
 *
 * Replaces the static "contacta con el administrador" block in ProgramForm.
 * Admin-only. Uses domain language throughout — never renders internal tipo slugs.
 *
 * Features:
 *  - Enable/disable close config for this program
 *  - Add / delete / reorder fields (via CloseConfigFieldRow)
 *  - Toggle "tema obligatorio" (session topic required)
 *  - Apply canonical preset for the program tipo
 *  - Persist via updateCloseConfig
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2, Plus } from "lucide-react";
import { CloseConfigFieldRow } from "./CloseConfigFieldRow";
import { CloseConfigAddField } from "./CloseConfigAddField";
import { useCloseConfig, useUpdateCloseConfig } from "../../hooks/useCloseConfig";
import type { CloseField, SessionCloseConfig } from "@shared/sessionSchemas";

interface CloseConfigEditorProps {
  programId: string;
  isAdmin: boolean;
}

export function CloseConfigEditor({ programId, isAdmin }: CloseConfigEditorProps) {
  const { data: serverConfig, isLoading } = useCloseConfig(programId);
  const updateConfig = useUpdateCloseConfig(programId);

  const [localConfig, setLocalConfig] = useState<SessionCloseConfig | null>(null);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync server → local on first load (not on subsequent saves)
  useEffect(() => {
    if (serverConfig && !dirty) {
      setLocalConfig(serverConfig);
    }
  }, [serverConfig, dirty]);

  if (!isAdmin) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        La configuración de cierre es gestionada por el administrador del sistema.
      </div>
    );
  }

  if (isLoading || !localConfig) {
    return <Skeleton className="h-32 w-full rounded-lg" />;
  }

  function update(patch: Partial<SessionCloseConfig>) {
    setLocalConfig((prev) => prev ? { ...prev, ...patch } : prev);
    setDirty(true);
  }

  function handleAddField(field: CloseField) {
    update({ fields: [...(localConfig?.fields ?? []), field] });
  }

  function handleDeleteField(slug: string) {
    update({ fields: (localConfig?.fields ?? []).filter((f) => f.slug !== slug) });
  }

  function handleToggleObligatorio(slug: string, value: boolean) {
    update({
      fields: (localConfig?.fields ?? []).map((f) =>
        f.slug === slug ? { ...f, obligatorio: value } : f
      ),
    });
  }

  function handleSave() {
    if (!localConfig) return;
    updateConfig.mutate({ programId, config: localConfig }, {
      onSuccess: () => setDirty(false),
    });
  }

  const existingSlugs = new Set((localConfig.fields ?? []).map((f) => f.slug));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-foreground">Campos al cerrar sesión</h4>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="close-enabled" className="text-sm text-muted-foreground">
            Activo
          </Label>
          <Switch
            id="close-enabled"
            checked={localConfig.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
            aria-label="Activar registro de cierre de sesión"
          />
        </div>
      </div>

      {localConfig.enabled && (
        <>
          {/* Tema obligatorio toggle */}
          <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 bg-muted/20">
            <div className="flex-1">
              <p className="text-sm font-medium">Tema de la sesión</p>
              <p className="text-xs text-muted-foreground">
                El responsable debe indicar el tema o contenido trabajado en la sesión.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Label htmlFor="tema-obligatorio" className="text-xs text-muted-foreground">
                Obligatorio
              </Label>
              <Switch
                id="tema-obligatorio"
                checked={localConfig.tema_obligatorio ?? false}
                onCheckedChange={(v) => update({ tema_obligatorio: v })}
                aria-label="Tema de sesión obligatorio"
              />
            </div>
          </div>

          {/* Field list */}
          <div className="space-y-2">
            {localConfig.fields.length === 0 && (
              <p className="text-sm text-muted-foreground py-2 text-center">
                Sin campos adicionales. Añade campos para recoger datos al cerrar.
              </p>
            )}
            {localConfig.fields.map((field) => (
              <CloseConfigFieldRow
                key={field.slug}
                field={field}
                onToggleObligatorio={handleToggleObligatorio}
                onDelete={handleDeleteField}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 w-full"
            onClick={() => setAddFieldOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Añadir campo
          </Button>

          <CloseConfigAddField
            open={addFieldOpen}
            onOpenChange={setAddFieldOpen}
            existingSlugs={existingSlugs}
            onAdd={handleAddField}
          />
        </>
      )}

      {dirty && (
        <Button
          type="button"
          className="w-full"
          disabled={updateConfig.isPending}
          onClick={handleSave}
        >
          {updateConfig.isPending ? "Guardando..." : "Guardar configuración"}
        </Button>
      )}
    </div>
  );
}
