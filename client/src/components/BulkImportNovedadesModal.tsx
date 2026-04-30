/**
 * BulkImportNovedadesModal.tsx — 3-step CSV bulk import for announcements.
 * Step 1: Upload CSV  →  Step 2: Preview (valid + error rows)  →  Step 3: Confirm
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Download, Upload } from "lucide-react";
import {
  usePreviewBulkImport,
  useConfirmBulkImport,
} from "@/features/announcements/hooks/useAnnouncements";
import { BulkImportHelp } from "@/features/announcements/components/BulkImportHelp";

// ── Types ────────────────────────────────────────────────────────────────────

// Server returns `audiencias` as a structured rule array; flatten it for display.
interface AudienceRulePayload {
  roles: readonly string[];
  programs: readonly string[];
}

interface ParsedRow {
  row_number: number;
  titulo: string;
  tipo: string;
  es_urgente: boolean;
  audiencias: AudienceRulePayload[];
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
}

interface RowError {
  row: number;
  field: string;
  message: string;
}

function audiencesToDisplayString(rules: AudienceRulePayload[]): string {
  if (rules.length === 0) return "*:*";
  return rules
    .map((r) => {
      const roles = r.roles.length === 0 ? "*" : r.roles.join(",");
      const programs = r.programs.length === 0 ? "*" : r.programs.join(",");
      return `${roles}:${programs}`;
    })
    .join(";");
}

interface TableRow {
  row_number: number;
  titulo: string;
  tipo: string;
  es_urgente: boolean;
  audiencias: string;
  valid: boolean;
  errorMessage?: string;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface BulkImportNovedadesModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ valid, message }: { valid: boolean; message?: string }) {
  if (valid) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        Válido
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"
      title={message}
    >
      {message ?? "Error"}
    </span>
  );
}

function PreviewTable({ rows }: { rows: TableRow[] }) {
  return (
    <div className="overflow-x-auto rounded border text-sm">
      <table className="w-full border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-600 border-b w-10">#</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 border-b">Título</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 border-b">Tipo</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 border-b">Urgente</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 border-b">Audiencias</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 border-b">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.row_number}
              className={row.valid ? "bg-white" : "bg-red-50"}
            >
              <td className="px-3 py-2 border-b text-gray-400">{row.row_number}</td>
              <td className="px-3 py-2 border-b max-w-xs truncate" title={row.titulo}>
                {row.titulo.length > 60 ? `${row.titulo.slice(0, 60)}…` : row.titulo}
              </td>
              <td className="px-3 py-2 border-b">{row.tipo}</td>
              <td className="px-3 py-2 border-b">{row.es_urgente ? "Sí" : "No"}</td>
              <td className="px-3 py-2 border-b max-w-xs truncate" title={row.audiencias}>
                {row.audiencias}
              </td>
              <td className="px-3 py-2 border-b">
                <StatusBadge valid={row.valid} message={row.errorMessage} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function BulkImportNovedadesModal({
  open,
  onOpenChange,
}: BulkImportNovedadesModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tableRows, setTableRows] = useState<TableRow[]>([]);
  const [errorCount, setErrorCount] = useState(0);
  const [previewToken, setPreviewToken] = useState<string>("");

  const previewMutation = usePreviewBulkImport();
  const confirmMutation = useConfirmBulkImport();

  function resetAndClose() {
    onOpenChange(false);
    // Defer reset so closing animation doesn't flash step 1 content
    setTimeout(() => {
      setStep(1);
      setTableRows([]);
      setErrorCount(0);
      setPreviewToken("");
    }, 300);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error("No se pudo leer el archivo");
      return;
    }

    previewMutation.mutate(
      { csv: text },
      {
        onSuccess: (data) => {
          const validData = data as unknown as {
            valid: ParsedRow[];
            errors: RowError[];
            preview_token: string;
          };

          const errorsByRow = new Map<number, string>();
          for (const err of validData.errors) {
            const existing = errorsByRow.get(err.row);
            errorsByRow.set(
              err.row,
              existing ? `${existing}; ${err.field}: ${err.message}` : `${err.field}: ${err.message}`
            );
          }

          const validRows: TableRow[] = validData.valid.map((r) => ({
            row_number: r.row_number,
            titulo: r.titulo,
            tipo: r.tipo,
            es_urgente: r.es_urgente,
            audiencias: audiencesToDisplayString(r.audiencias),
            valid: true,
          }));

          const errorRows: TableRow[] = validData.errors.reduce<TableRow[]>((acc, err) => {
            if (acc.some((r) => r.row_number === err.row)) return acc;
            acc.push({
              row_number: err.row,
              titulo: "",
              tipo: "",
              es_urgente: false,
              audiencias: "",
              valid: false,
              errorMessage: errorsByRow.get(err.row),
            });
            return acc;
          }, []);

          const combined = [...validRows, ...errorRows].sort(
            (a, b) => a.row_number - b.row_number
          );

          setTableRows(combined);
          setErrorCount(validData.errors.length > 0 ? errorRows.length : 0);
          setPreviewToken(validData.preview_token);
          setStep(2);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Error al procesar el CSV");
        },
      }
    );

    // Reset the input so the same file can be re-selected after going back
    e.target.value = "";
  }

  function handleConfirm() {
    setStep(3);
    confirmMutation.mutate(
      { preview_token: previewToken },
      {
        onSuccess: (data) => {
          const result = data as { created_count: number; error_count: number; failed_rows: unknown[] };
          toast.success(`${result.created_count} novedades importadas`);
          resetAndClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Error al importar");
          setStep(2);
        },
      }
    );
  }

  const stepLabel = step === 1
    ? "1/3 — Subir CSV"
    : step === 2
    ? "2/3 — Vista previa"
    : "3/3 — Confirmando";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar novedades ({stepLabel})</DialogTitle>
        </DialogHeader>

        {/* Step 1 — Upload */}
        {step === 1 && (
          <div className="space-y-5 py-2">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <a
                href="/novedades-bulk-template.csv"
                download
                className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
              >
                <Download className="w-4 h-4" />
                Descargar plantilla CSV
              </a>
            </div>

            <BulkImportHelp />

            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-gray-50 transition-colors">
              {previewMutation.isPending ? (
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-gray-400" />
              )}
              <span className="text-sm text-gray-600 font-medium">
                {previewMutation.isPending
                  ? "Analizando CSV…"
                  : "Haz clic para seleccionar un archivo CSV"}
              </span>
              <input
                type="file"
                accept=".csv"
                className="sr-only"
                disabled={previewMutation.isPending}
                onChange={handleFileChange}
              />
            </label>
          </div>
        )}

        {/* Step 2 — Preview */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-600">
              {tableRows.length} filas encontradas
              {errorCount > 0 && (
                <span className="ml-2 text-red-600 font-medium">
                  · {errorCount} con errores (corrige el CSV y vuelve a subir)
                </span>
              )}
            </p>
            <PreviewTable rows={tableRows} />
          </div>
        )}

        {/* Step 3 — Confirming */}
        {step === 3 && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            <p className="text-sm text-gray-600">Importando novedades…</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 1 && (
            <Button variant="outline" onClick={resetAndClose}>
              Cancelar
            </Button>
          )}

          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                Volver
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={
                  errorCount > 0 ||
                  tableRows.filter((r) => r.valid).length === 0
                }
              >
                Confirmar importación
              </Button>
            </>
          )}

          {step === 3 && (
            <Button variant="outline" disabled>
              Cancelar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
