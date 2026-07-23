import { useState } from "react";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { DocumentPreviewDialog } from "./DocumentPreviewDialog";

interface GenerateDocumentButtonProps {
  familyId: string;
  // informe_social is not accepted: informes must persist (families.generateSocialReport)
  // so the ADR-0014 renovación gate can see them — the server enum rejects it too.
  slug: "nota_entrega" | "derivacion";
  sessionId?: string;
  label: string;
  blockingError?: string | null;
}

interface PreviewData {
  bufferBase64: string;
  fileName: string;
  mime: string;
}

export function GenerateDocumentButton({
  familyId,
  slug,
  sessionId,
  label,
  blockingError,
}: GenerateDocumentButtonProps) {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const generate = trpc.families.generateDocument.useMutation({
    onSuccess: (data) => {
      // Decode base64 → Blob → object URL → trigger browser download → revoke
      try {
        const binaryStr = atob(data.bufferBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: data.mime });
        const url = URL.createObjectURL(blob);

        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = data.fileName;
        anchor.click();

        URL.revokeObjectURL(url);
      } catch {
        // Download failure should not block preview state update
        toast.error("Error al descargar el documento");
      }

      setPreviewData(data);
    },
    onError: (e) => toast.error(e.message),
  });

  const isDisabled = !!blockingError || generate.isPending;

  const handleClick = () => {
    generate.mutate({
      family_id: familyId,
      slug,
      session_id: sessionId,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {blockingError && (
        <p role="alert" className="text-xs text-destructive">
          {blockingError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={handleClick}
          disabled={isDisabled}
          aria-label={label}
          size="sm"
        >
          {generate.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileDown className="h-4 w-4" aria-hidden="true" />
          )}
          {label}
        </Button>

        {previewData && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewOpen(true)}
            aria-label={`Vista previa de ${label}`}
          >
            Vista previa
          </Button>
        )}
      </div>

      {previewData && (
        <DocumentPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          bufferBase64={previewData.bufferBase64}
          fileName={previewData.fileName}
          mime={previewData.mime}
        />
      )}
    </div>
  );
}
