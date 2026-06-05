/**
 * InformesEnrichLane — the INFORMES SOCIALES (wide sheet) enrich lane of the
 * legacy importer. Upload → preview (buckets + per-family member-match summary +
 * narrative-present indicator) → confirm. Backfill-only: never creates families.
 *
 * RGPD: the preview shows whether a social-report narrative EXISTS, never the
 * Art.9 text itself. Spanish-only chrome. WCAG 2.1 AA — status is conveyed by
 * icon + text (not colour alone), semantic table, labelled controls.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2, Upload, AlertTriangle, CheckCircle2, HelpCircle, FileText, SearchX, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  usePreviewInformesImport,
  useConfirmInformesImport,
} from "@/features/families/hooks/useFamilias";
import {
  summarizeMemberMatches,
  classifyInformesFamily as classify,
  informesHasNarrative as hasNarrative,
  type InformesBucket as Bucket,
} from "./informesMatchSummary";
import type {
  InformesFamily,
  InformesPreviewResponse,
} from "../../../../../shared/legacyFamiliasTypes";

function MatchSummaryLine({ family }: { family: InformesFamily }) {
  const s = summarizeMemberMatches(family.member_matches);
  const chips: { label: string; n: number; cls: string }[] = [
    { label: "emparejados", n: s.matched, cls: "text-green-800" },
    { label: "por confirmar", n: s.needsConfirm, cls: "text-amber-800" },
    { label: "conflicto DOB/DNI", n: s.conflict, cls: "text-red-800" },
    { label: "ambiguos", n: s.ambiguous, cls: "text-red-800" },
    { label: "sin emparejar", n: s.unmatched, cls: "text-gray-600" },
  ].filter((c) => c.n > 0);
  if (chips.length === 0) return <span className="text-gray-500">sin miembros</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {chips.map((c) => (
        <span key={c.label} className={c.cls}>
          {c.n} {c.label}
        </span>
      ))}
    </span>
  );
}

function FamilyCard({ family }: { family: InformesFamily }) {
  const [open, setOpen] = useState(false);
  const bucket = classify(family);
  return (
    <div className="rounded border bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
        )}
        <span className="font-mono text-sm text-gray-500">#{family.legacy_numero_familia}</span>
        <span className="text-sm font-medium">
          {family.titular.nombre ?? "(sin titular)"} {family.titular.apellidos ?? ""}
        </span>
        {hasNarrative(family) && (
          <span className="inline-flex items-center gap-1 text-xs text-blue-700">
            <FileText className="h-3 w-3" aria-hidden="true" /> informe social
          </span>
        )}
        {family.family_id === null && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
            <SearchX className="h-3 w-3" aria-hidden="true" /> no encontrada
          </span>
        )}
      </button>
      {open && (
        <div className="border-t bg-gray-50/50 p-3 space-y-2 text-sm">
          {bucket === "missing" && (
            <p className="text-gray-700">
              No existe una familia con este número en el padrón. INFORMES nunca crea
              familias: primero impórtala desde el padrón (otra pestaña).
            </p>
          )}
          <p>
            <span className="font-medium">Miembros:</span>{" "}
            <MatchSummaryLine family={family} />
          </p>
          {family.members_truncated && (
            <p className="text-amber-800">
              Posibles miembros adicionales más allá del límite de 14 columnas —
              verificar manualmente.
            </p>
          )}
          <p className="text-gray-600">
            Informe social en el archivo: {hasNarrative(family) ? "sí" : "no"}.
          </p>
        </div>
      )}
    </div>
  );
}

const TAB_LABEL: Record<Bucket, string> = {
  enrich: "Para enriquecer",
  warnings: "Con avisos",
  missing: "No encontradas",
};

export function InformesEnrichLane({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preview, setPreview] = useState<InformesPreviewResponse | null>(null);
  const [filename, setFilename] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<Bucket>("enrich");
  const previewMutation = usePreviewInformesImport();
  const confirmMutation = useConfirmInformesImport();

  async function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Por favor selecciona un archivo CSV");
      return;
    }
    const text = await file.text().catch(() => null);
    if (text === null) {
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
          setTab("enrich");
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Error al procesar el CSV"),
      }
    );
  }

  function handleConfirm() {
    if (!preview) return;
    setStep(3);
    confirmMutation.mutate(
      { preview_token: preview.preview_token, src_filename: filename },
      {
        onSuccess: (r) => {
          toast.success(
            `${r.enriched_count} familias enriquecidas` +
              (r.skipped_missing_count > 0 ? ` · ${r.skipped_missing_count} no encontradas` : "") +
              (r.error_count > 0 ? ` · ${r.error_count} con error` : "")
          );
          onDone();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Error al enriquecer");
          setStep(2);
        },
      }
    );
  }

  const grouped = useMemo(
    () => (preview ? preview.families.filter((f) => classify(f) === tab) : []),
    [preview, tab]
  );

  if (step === 3) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" aria-hidden="true" />
        <p className="text-sm text-gray-600" role="status">Enriqueciendo familias…</p>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="space-y-5 py-2">
        <p className="text-sm text-gray-600">
          Sube el CSV de <span className="font-mono">INFORMES SOCIALES</span> (una fila por
          familia, con la descripción de situación familiar y los miembros). Enriquece
          familias ya existentes del padrón; nunca crea familias nuevas.
        </p>
        <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 cursor-pointer hover:bg-gray-50">
          {previewMutation.isPending ? (
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" aria-hidden="true" />
          ) : (
            <Upload className="h-8 w-8 text-gray-400" aria-hidden="true" />
          )}
          <span className="text-sm font-medium text-gray-600">
            {previewMutation.isPending ? "Analizando CSV…" : "Haz clic o arrastra un CSV de informes"}
          </span>
          <input
            type="file"
            accept=".csv"
            className="sr-only"
            disabled={previewMutation.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void processFile(f);
            }}
          />
        </label>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onDone}>Cancelar</Button>
        </div>
      </div>
    );
  }

  // step 2 — preview
  return (
    <div className="space-y-4 py-2">
      <div className="rounded border bg-gray-50 p-3 text-sm">
        <p className="font-medium">{preview!.total_families} familias en el archivo</p>
        <p className="flex flex-wrap gap-x-3 text-gray-600">
          <span className="inline-flex items-center gap-1 text-green-700">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> {preview!.families_to_enrich} para enriquecer
          </span>
          <span className="inline-flex items-center gap-1 text-amber-700">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {preview!.warning_families} con avisos
          </span>
          <span className="inline-flex items-center gap-1 text-gray-600">
            <HelpCircle className="h-3 w-3" aria-hidden="true" /> {preview!.family_missing} no encontradas
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Categorías de familias">
        {(["enrich", "warnings", "missing"] as Bucket[]).map((b) => {
          const count =
            b === "enrich"
              ? preview!.families.filter((f) => classify(f) === "enrich").length
              : b === "warnings"
              ? preview!.families.filter((f) => classify(f) === "warnings").length
              : preview!.family_missing;
          return (
            <Button
              key={b}
              role="tab"
              aria-selected={tab === b}
              variant={tab === b ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(b)}
            >
              {TAB_LABEL[b]} ({count})
            </Button>
          );
        })}
      </div>

      <div className="space-y-2">
        {grouped.length === 0 ? (
          <p className="text-sm italic text-gray-500">No hay familias en esta categoría.</p>
        ) : (
          grouped.map((f, idx) => <FamilyCard key={`${f.legacy_numero_familia}-${idx}`} family={f} />)
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setStep(1)}>Volver</Button>
        <Button onClick={handleConfirm} disabled={preview!.families_to_enrich === 0}>
          {preview!.families_to_enrich === 0
            ? "Ninguna familia para enriquecer"
            : `Enriquecer ${preview!.families_to_enrich} familias`}
        </Button>
      </div>
    </div>
  );
}
