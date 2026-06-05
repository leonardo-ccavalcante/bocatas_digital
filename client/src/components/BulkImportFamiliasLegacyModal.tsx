/*
 * BulkImportFamiliasLegacyModal.tsx — 3-step bulk importer for the legacy
 * FAMILIAS Excel/CSV format.
 *
 * Step 1: Upload CSV  →  Step 2: Preview (per-family + per-row)  →  Step 3: Confirm
 *
 * Differences from BulkImportNovedadesModal:
 *   - Preview is per-family (not per-row), with an expandable members table
 *   - 4 status tabs: OK / Advertencias / Errores / Duplicadas (already imported)
 *   - Atomicity is per-family (one bad family doesn't block the rest), so
 *     "Confirmar" is enabled even when warnings or duplicates are present;
 *     only group-level errors block the entire import.
 *
 * Phase 4 additions:
 *   - Sticky action bar at the top of the dialog (no scroll needed)
 *   - "Descargar reporte" button (opens /api/legacy-import/report/:token)
 *   - "Solo importar familias OK" toggle (excludes warnings + duplicates)
 */
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy as CopyIcon,
  ChevronDown,
  ChevronRight,
  Download,
} from "lucide-react";
import {
  usePreviewLegacyImport,
  useConfirmLegacyImport,
} from "@/features/families/hooks/useFamilias";
import { InformesEnrichLane } from "@/features/families/components/InformesEnrichLane";
// Type-only imports — Zod runtime is tree-shaken from the client bundle.
import type {
  FamilyGroup,
  PersonDedupHit,
  PreviewResponse,
} from "../../../shared/legacyFamiliasTypes";

type FilterTab = "ok" | "warnings" | "errors" | "duplicates";

interface BulkImportFamiliasLegacyModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

// ── Status helpers ───────────────────────────────────────────────────────────

function classifyGroup(g: FamilyGroup): FilterTab {
  if (g.errors.length > 0) return "errors";
  if (g.family_already_imported) return "duplicates";
  if (g.person_dedup_hits.length > 0 || g.rows.some((r) => r.warnings.length > 0)) {
    return "warnings";
  }
  return "ok";
}

function StatusPill({ tab }: { tab: FilterTab }) {
  const styles: Record<FilterTab, { bg: string; text: string; label: string; Icon: typeof CheckCircle2 }> = {
    ok: { bg: "bg-green-100", text: "text-green-800", label: "OK", Icon: CheckCircle2 },
    warnings: { bg: "bg-amber-100", text: "text-amber-800", label: "Advertencia", Icon: AlertTriangle },
    errors: { bg: "bg-red-100", text: "text-red-800", label: "Error", Icon: XCircle },
    duplicates: { bg: "bg-blue-100", text: "text-blue-800", label: "Duplicada", Icon: CopyIcon },
  };
  const { bg, text, label, Icon } = styles[tab];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${bg} ${text}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ── Per-family expandable card ───────────────────────────────────────────────

function FamilyRow({ group }: { group: FamilyGroup }) {
  const [open, setOpen] = useState(false);
  const tab = classifyGroup(group);
  const titular = group.rows[group.titular_index];
  const dedupByRow = new Map<number, PersonDedupHit>();
  for (const h of group.person_dedup_hits) dedupByRow.set(h.row_index, h);

  return (
    <div className="rounded border bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
      >
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        <span className="font-mono text-sm text-gray-500">#{group.legacy_numero_familia}</span>
        <span className="font-medium text-sm">
          {titular ? `${titular.person.nombre} ${titular.person.apellidos}` : "(sin titular)"}
        </span>
        <span className="text-xs text-gray-500">· {group.rows.length} miembros</span>
        {titular?.estado === "baja" && (
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
            baja
          </span>
        )}
        <span className="ml-auto"><StatusPill tab={tab} /></span>
      </button>

      {open && (
        <div className="border-t bg-gray-50/50 p-3 space-y-2 text-sm">
          {group.errors.length > 0 && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-red-900">
              <p className="font-medium">Errores de grupo:</p>
              <ul className="ml-5 list-disc">
                {group.errors.map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            </div>
          )}
          {group.family_already_imported && (
            <div className="rounded border border-blue-200 bg-blue-50 p-2 text-blue-900">
              Esta familia ya fue importada anteriormente. Se omitirá en la confirmación.
            </div>
          )}

          <div className="overflow-x-auto rounded border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-1 text-left font-medium text-gray-600">Fila</th>
                  <th className="px-2 py-1 text-left font-medium text-gray-600">Rol</th>
                  <th className="px-2 py-1 text-left font-medium text-gray-600">Nombre</th>
                  <th className="px-2 py-1 text-left font-medium text-gray-600">DOB</th>
                  <th className="px-2 py-1 text-left font-medium text-gray-600">País</th>
                  <th className="px-2 py-1 text-left font-medium text-gray-600">Avisos</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((r, idx) => {
                  const dedup = dedupByRow.get(idx);
                  const allWarnings = [
                    ...r.warnings.map((w) => w.message),
                    ...(dedup
                      ? [
                          `Persona ya existe en BD${dedup.existing_pais_origen ? ` (país ${dedup.existing_pais_origen})` : ""}.`,
                        ]
                      : []),
                  ];
                  return (
                    <tr key={r.row_number} className="border-t">
                      <td className="px-2 py-1 text-gray-400">{r.row_number}</td>
                      <td className="px-2 py-1">
                        {r.is_titular ? (
                          <span className="font-medium">titular</span>
                        ) : (
                          <span className="text-gray-600">
                            {r.parentesco_original ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {r.person.nombre} {r.person.apellidos}
                      </td>
                      <td className="px-2 py-1 text-gray-600">
                        {r.person.fecha_nacimiento ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-gray-600">
                        {r.person.pais_origen ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-amber-700">
                        {allWarnings.length === 0 ? "—" : allWarnings.join(" · ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function BulkImportFamiliasLegacyModal({
  open,
  onOpenChange,
}: BulkImportFamiliasLegacyModalProps) {
  const [lane, setLane] = useState<"roster" | "informes">("roster");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [filename, setFilename] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<FilterTab>("ok");
  const [dragActive, setDragActive] = useState(false);
  // "Actualizar familias existentes" → p_mode 'update' vs 'skip'.
  const [updateExisting, setUpdateExisting] = useState(false);
  // "Solo importar familias OK" → exclude warning + duplicate families.
  const [skipWarnings, setSkipWarnings] = useState(false);

  const previewMutation = usePreviewLegacyImport();
  const confirmMutation = useConfirmLegacyImport();

  function resetAndClose() {
    onOpenChange(false);
    setTimeout(() => {
      setLane("roster");
      setStep(1);
      setPreview(null);
      setFilename(undefined);
      setActiveTab("ok");
      setUpdateExisting(false);
      setSkipWarnings(false);
    }, 300);
  }

  async function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Por favor selecciona un archivo CSV");
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error("No se pudo leer el archivo");
      return;
    }
    setFilename(file.name);
    previewMutation.mutate(
      { csv: text, src_filename: file.name },
      {
        onSuccess: (data) => {
          setPreview(data);
          setStep(2);
          setActiveTab("ok");
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Error al procesar el CSV");
        },
      }
    );
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  }
  function handleDrag(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }
  async function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) await processFile(f);
  }

  function handleConfirm() {
    if (!preview) return;
    setStep(3);

    // When "Solo importar familias OK" is active, collect the legacy numbers
    // of warning, duplicate, AND error families so the SQL function skips them.
    // Error families are always excluded (SQL savepoints handle them gracefully),
    // but passing them explicitly ensures audit trail shows 'skipped_excluded'.
    let excludedNumbers: string[] | undefined;
    if (skipWarnings) {
      excludedNumbers = preview.groups
        .filter((g) => {
          const tab = classifyGroup(g);
          return tab === "warnings" || tab === "duplicates" || tab === "errors";
        })
        .map((g) => g.legacy_numero_familia);
    }

    confirmMutation.mutate(
      {
        preview_token: preview.preview_token,
        src_filename: filename,
        mode: updateExisting ? "update" : "skip",
        excluded_family_numbers: excludedNumbers,
      },
      {
        onSuccess: (r) => {
          const updated = r.updated_count > 0 ? `, ${r.updated_count} actualizadas` : "";
          if (r.error_count > 0) {
            toast.warning(
              `Importación parcial: ${r.created_count} creadas${updated}, ${r.skipped_count} omitidas, ${r.error_count} con error.`
            );
          } else {
            toast.success(
              `${r.created_count} familias importadas${updated}${r.skipped_count > 0 ? ` (${r.skipped_count} omitidas)` : ""}`
            );
          }
          if (r.enrollment_program_missing) {
            toast.warning("El programa de familias no existe en este entorno; no se inscribió a nadie.");
          }
          resetAndClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Error al importar");
          setStep(2);
        },
      }
    );
  }

  const filteredGroups = useMemo(() => {
    if (!preview) return [];
    return preview.groups.filter((g) => classifyGroup(g) === activeTab);
  }, [preview, activeTab]);

  const stepLabel =
    step === 1 ? "1/3 — Subir CSV" : step === 2 ? "2/3 — Vista previa" : "3/3 — Confirmando";

  // Error families are handled by per-family savepoints in the SQL function
  // (they are skipped with audit 'error'). The frontend should NOT block
  // confirmation when error families coexist with OK/warning families.
  // Only block when there are literally zero importable families.
  const blockedByErrors = false; // SQL handles per-family errors gracefully.

  // Count of families that will actually be imported (respects skipWarnings toggle).
  const familiasAImportar = useMemo(() => {
    if (!preview) return 0;
    if (skipWarnings) {
      // Only OK families (+ duplicates if updateExisting is on)
      return (
        preview.valid_families +
        (updateExisting ? preview.duplicate_families : 0)
      );
    }
    return (
      preview.valid_families +
      preview.warning_families +
      (updateExisting ? preview.duplicate_families : 0)
    );
  }, [preview, skipWarnings, updateExisting]);

  // Whether the report download button should be shown.
  const hasWarningsOrErrors =
    (preview?.warning_families ?? 0) > 0 || (preview?.error_families ?? 0) > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetAndClose();
      }}
    >
      {/*
       * Layout: flex column, fixed max-height.
       * - DialogHeader + sticky action bar: fixed at top, never scroll.
       * - Inner content area: overflow-y-auto, grows to fill remaining space.
       * This prevents the user from having to scroll to reach the action buttons.
       */}
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-3 border-b">
          <DialogHeader>
            <DialogTitle>
              {lane === "informes"
                ? "Enriquecer familias con Informes Sociales"
                : `Importar familias desde CSV legacy (${stepLabel})`}
            </DialogTitle>
          </DialogHeader>

          {/* Lane switcher */}
          <div role="tablist" aria-label="Tipo de importación" className="flex gap-2 mt-3">
            <Button
              role="tab"
              aria-selected={lane === "roster"}
              variant={lane === "roster" ? "default" : "outline"}
              size="sm"
              onClick={() => setLane("roster")}
            >
              Padrón (familias)
            </Button>
            <Button
              role="tab"
              aria-selected={lane === "informes"}
              variant={lane === "informes" ? "default" : "outline"}
              size="sm"
              onClick={() => setLane("informes")}
            >
              Informes sociales (enriquecer)
            </Button>
          </div>
        </div>

        {/* ── Sticky action bar (step 2 only, roster lane only) ──────────── */}
        {lane === "roster" && step === 2 && preview && (
          <div className="px-6 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-2">
            {/* Back button */}
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              Volver
            </Button>

            {/* Download report button — shown when there are warnings or errors */}
            {hasWarningsOrErrors && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(
                    `/api/legacy-import/report/${preview.preview_token}`,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
              >
                <Download className="h-4 w-4 mr-1.5" />
                Descargar reporte
              </Button>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Confirm button */}
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={familiasAImportar === 0}
            >
              {familiasAImportar === 0
                ? "Sin familias para importar"
                : `Confirmar importación (${familiasAImportar} familias)`}
            </Button>
          </div>
        )}

        {/* ── Scrollable content area ────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {lane === "informes" ? (
            <div className="p-6">
              <InformesEnrichLane onDone={resetAndClose} />
            </div>
          ) : (
            <div className="p-6 space-y-4">

              {/* Step 1: Upload */}
              {step === 1 && (
                <div className="space-y-5 py-2">
                  <p className="text-sm text-gray-600">
                    Acepta el CSV exportado del Excel <span className="font-mono">FAMILIAS</span> legacy (formato
                    con NÚMERO FAMILIA BOCATAS, CABEZA DE FAMILIA marcada con &ldquo;x&rdquo;, miembros como filas
                    adicionales). Para el formato CSV interno usa el otro botón.
                  </p>
                  <label
                    className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors ${
                      dragActive ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    {previewMutation.isPending ? (
                      <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                    ) : (
                      <Upload className="h-8 w-8 text-gray-400" />
                    )}
                    <span className="text-sm font-medium text-gray-600 text-center">
                      {previewMutation.isPending
                        ? "Analizando CSV…"
                        : dragActive
                        ? "Suelta el archivo CSV aquí"
                        : "Haz clic o arrastra un archivo CSV aquí"}
                    </span>
                    <input
                      type="file"
                      accept=".csv"
                      className="sr-only"
                      disabled={previewMutation.isPending}
                      onChange={handleFileChange}
                    />
                  </label>
                  <div className="flex justify-end">
                    <Button variant="outline" onClick={resetAndClose}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 2: Preview */}
              {step === 2 && preview && (
                <div className="space-y-4 py-2">
                  {/* Summary card */}
                  <div className="rounded border bg-gray-50 p-3 text-sm">
                    <p className="font-medium">
                      {preview.total_families} familias · {preview.total_rows} personas
                    </p>
                    <p className="text-gray-600">
                      <span className="text-green-700">{preview.valid_families} OK</span> ·{" "}
                      <span className="text-amber-700">{preview.warning_families} con advertencias</span> ·{" "}
                      <span className="text-red-700">{preview.error_families} con errores</span> ·{" "}
                      <span className="text-blue-700">{preview.duplicate_families} ya importadas</span>
                    </p>
                    {preview.parse_errors.length > 0 && (
                      <p className="text-red-700 mt-1">
                        {preview.parse_errors.length} filas no pudieron interpretarse y fueron descartadas (corregir en origen).
                      </p>
                    )}
                  </div>

                  {/* "Actualizar familias existentes" toggle */}
                  <div className="flex items-start gap-3 rounded border bg-gray-50 p-3">
                    <Switch
                      id="update-existing"
                      checked={updateExisting}
                      onCheckedChange={setUpdateExisting}
                    />
                    <Label htmlFor="update-existing" className="text-sm font-medium">
                      Actualizar familias existentes
                      <span className="mt-0.5 block text-xs font-normal text-gray-500">
                        Re-sincroniza las {preview.duplicate_families} familias ya importadas
                        (estado, recuento y datos; añade miembros nuevos). Si está
                        desactivado, las duplicadas se omiten.
                      </span>
                    </Label>
                  </div>

                  {/* "Solo importar familias OK" toggle — shown when there are warnings or duplicates */}
                  {(preview.warning_families > 0 || preview.duplicate_families > 0) && (
                    <div className="flex items-start gap-3 rounded border bg-amber-50 border-amber-200 p-3">
                      <Switch
                        id="skip-warnings"
                        checked={skipWarnings}
                        onCheckedChange={setSkipWarnings}
                      />
                      <Label htmlFor="skip-warnings" className="text-sm font-medium">
                        Solo importar familias OK
                        <span className="mt-0.5 block text-xs font-normal text-gray-500">
                          Omite las {preview.warning_families} familias con advertencias
                          {!updateExisting && preview.duplicate_families > 0
                            ? ` y las ${preview.duplicate_families} ya importadas`
                            : ""}
                          . Útil para importar solo los registros limpios y revisar el resto manualmente.
                          {hasWarningsOrErrors && (
                            <> Descarga el reporte para ver el detalle.</>
                          )}
                        </span>
                      </Label>
                    </div>
                  )}

                  {/* Filter tabs */}
                  <div className="flex flex-wrap gap-2">
                    {(["ok", "warnings", "errors", "duplicates"] as FilterTab[]).map((tab) => {
                      const count =
                        tab === "ok"
                          ? preview.valid_families
                          : tab === "warnings"
                          ? preview.warning_families
                          : tab === "errors"
                          ? preview.error_families
                          : preview.duplicate_families;
                      const label =
                        tab === "ok" ? "OK" : tab === "warnings" ? "Advertencias" : tab === "errors" ? "Errores" : "Duplicadas";
                      return (
                        <Button
                          key={tab}
                          variant={activeTab === tab ? "default" : "outline"}
                          size="sm"
                          onClick={() => setActiveTab(tab)}
                        >
                          {label} ({count})
                        </Button>
                      );
                    })}
                  </div>

                  {/* Family list */}
                  <div className="space-y-2">
                    {filteredGroups.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No hay familias en esta categoría.</p>
                    ) : (
                      filteredGroups.map((g, idx) => (
                        <FamilyRow key={`${g.legacy_numero_familia}-${idx}`} group={g} />
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Confirming spinner */}
              {step === 3 && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                  <p className="text-sm text-gray-600">Importando familias…</p>
                </div>
              )}

            </div>
          )}
        </div>

        {/* ── Bottom action bar (step 3 cancel only) ────────────────────── */}
        {step === 3 && (
          <div className="px-6 py-3 border-t bg-gray-50 flex justify-end">
            <Button variant="outline" disabled>
              Cancelar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
