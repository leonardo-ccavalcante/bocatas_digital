import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { createClient } from "@/lib/supabase/client";
import { useProgramDocumentTypes } from "./hooks/useProgramDocumentTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadModalProps {
  programaId: string;
  open: boolean;
  onClose: () => void;
}

interface DocType {
  id: string;
  slug: string;
  nombre: string;
  scope: "familia" | "miembro";
  is_required: boolean;
}

interface FamiliaResult {
  id: string;
  familia_numero: number;
  persons: { id: string; nombre: string; apellidos: string | null } | null;
}

interface Miembro {
  nombre: string;
  apellidos: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extFromFile(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName) return fromName.toLowerCase();
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return file.type.split("/")[1] ?? "jpg";
  return "bin";
}

function familiaLabel(f: FamiliaResult): string {
  const nombre = f.persons?.nombre ?? "";
  const apellidos = f.persons?.apellidos ?? "";
  return `#${f.familia_numero} ${nombre} ${apellidos}`.trimEnd();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UploadModal({ programaId, open, onClose }: UploadModalProps) {
  const [tipoSlug, setTipoSlug] = useState("");
  const [familiaSearch, setFamiliaSearch] = useState("");
  const [selectedFamilia, setSelectedFamilia] = useState<FamiliaResult | null>(null);
  const [memberIndex, setMemberIndex] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: docTypes = [] } = useProgramDocumentTypes(programaId);

  const searchEnabled = familiaSearch.length >= 2 && selectedFamilia === null;
  const { data: familiaResults = [] } = trpc.families.getAll.useQuery(
    { search: familiaSearch, estado: "all" },
    { enabled: searchEnabled }
  );

  const selectedType = (docTypes as DocType[]).find((t) => t.slug === tipoSlug) ?? null;
  const isMiembroScope = selectedType?.scope === "miembro";

  const { data: familiaDetail } = trpc.families.getById.useQuery(
    { id: selectedFamilia?.id ?? "" },
    { enabled: !!selectedFamilia && isMiembroScope }
  );

  const miembros: Miembro[] = (familiaDetail as { miembros?: Miembro[] } | null)?.miembros ?? [];

  // ── Mutations ─────────────────────────────────────────────────────────────
  const uploadMutation = trpc.families.uploadFamilyDocument.useMutation();
  const deleteMutation = trpc.families.deleteFamilyDocument.useMutation();

  // ── Derived: can submit ───────────────────────────────────────────────────
  const needsMember = isMiembroScope && selectedFamilia !== null;
  const canSubmit =
    tipoSlug !== "" &&
    selectedFamilia !== null &&
    (!needsMember || memberIndex !== null) &&
    file !== null &&
    !isUploading &&
    !uploadMutation.isPending;

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleFamiliaSelect(familia: FamiliaResult) {
    setSelectedFamilia(familia);
    setFamiliaSearch(familiaLabel(familia));
    setMemberIndex(null);
  }

  function handleFamiliaInputChange(value: string) {
    setFamiliaSearch(value);
    if (selectedFamilia !== null) {
      setSelectedFamilia(null);
      setMemberIndex(null);
    }
  }

  function handleTipoChange(slug: string) {
    setTipoSlug(slug);
    setMemberIndex(null);
  }

  async function handleSubmit() {
    if (!canSubmit || !selectedFamilia || !file || !tipoSlug) return;

    const idx = isMiembroScope ? (memberIndex ?? -1) : -1;
    const ext = extFromFile(file);
    const storagePath = `${selectedFamilia.id}/${idx}/${tipoSlug}/${Date.now()}.${ext}`;

    setIsUploading(true);

    try {
      const insertedDoc = await uploadMutation.mutateAsync({
        family_id: selectedFamilia.id,
        member_index: idx,
        documento_tipo: tipoSlug,
        documento_url: storagePath,
      });

      const supabase = createClient();
      const { error: storageError } = await supabase.storage
        .from("family-documents")
        .upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });

      if (storageError) {
        try {
          await deleteMutation.mutateAsync({ id: insertedDoc.id });
        } catch {
          toast.error(
            `Error al subir archivo y al limpiar el registro. ID: ${insertedDoc.id}`
          );
          return;
        }
        toast.error(storageError.message || "Error al subir el archivo");
        return;
      }

      toast.success("1 archivo(s) subido(s)");
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  }

  function handleClose() {
    onClose();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Subir documento</DialogTitle>
          <DialogDescription>
            Selecciona el tipo, la familia y el archivo para subir un documento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 1. Tipo de documento */}
          <div className="space-y-1">
            <Label htmlFor="tipo-select">Tipo de documento *</Label>
            <Select
              value={tipoSlug}
              onValueChange={handleTipoChange}
            >
              <SelectTrigger
                id="tipo-select"
                aria-label="Tipo de documento"
              >
                <SelectValue placeholder="Selecciona un tipo…" />
              </SelectTrigger>
              <SelectContent>
                {(docTypes as DocType[]).map((t) => (
                  <SelectItem key={t.id} value={t.slug}>
                    {t.nombre} ({t.scope === "familia" ? "Por familia" : "Por miembro"})
                    {t.is_required ? " · Obligatorio" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Familia typeahead */}
          <div className="space-y-1">
            <Label htmlFor="familia-search">Familia *</Label>
            <Input
              id="familia-search"
              aria-label="Buscar familia"
              placeholder="Escribe al menos 2 caracteres…"
              value={familiaSearch}
              onChange={(e) => handleFamiliaInputChange(e.target.value)}
              autoComplete="off"
            />
            {selectedFamilia === null && (familiaResults as FamiliaResult[]).length > 0 && (
              <div className="mt-1 border rounded-md divide-y max-h-48 overflow-y-auto">
                {(familiaResults as FamiliaResult[]).slice(0, 8).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-label={familiaLabel(f)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                    onClick={() => handleFamiliaSelect(f)}
                  >
                    {familiaLabel(f)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3. Miembro (only when miembro-scoped type AND family selected) */}
          {isMiembroScope && selectedFamilia !== null && (
            <div className="space-y-1">
              <Label htmlFor="miembro-select">Miembro</Label>
              <Select
                value={memberIndex !== null ? String(memberIndex) : ""}
                onValueChange={(v) => setMemberIndex(Number(v))}
              >
                <SelectTrigger
                  id="miembro-select"
                  aria-label="Miembro"
                >
                  <SelectValue placeholder="Selecciona un miembro…" />
                </SelectTrigger>
                <SelectContent>
                  {miembros.map((m, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {m.nombre} {m.apellidos}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 4. Archivo */}
          <div className="space-y-1">
            <Label htmlFor="file-input">Archivo *</Label>
            <Input
              id="file-input"
              aria-label="Archivo *"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={isUploading}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
            Subir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
