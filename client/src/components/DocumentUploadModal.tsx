import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Upload, Download, Trash2, Calendar, User } from "lucide-react";

interface DocumentUploadModalProps {
  familyId: string;
  documentType: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DocumentRecord {
  id: string;
  documento_tipo: string;
  documento_url: string | null;
  fecha_upload: string | null;
  verified_by: string | null;
  created_at: string;
}

export function DocumentUploadModal({
  familyId,
  documentType,
  open,
  onOpenChange,
}: DocumentUploadModalProps) {
  const [isUploading, setIsUploading] = useState(false);

  // Queries
  const { data: history = [], isLoading, refetch } = (trpc.families as any).getDocumentHistory.useQuery(
    { familyId },
    { enabled: open }
  );

  // Mutations
  const updateDocumentMutation = (trpc.families as any).updateMemberDocument.useMutation({
    onSuccess: () => {
      toast.success("Documento actualizado exitosamente");
      refetch();
      setIsUploading(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "No se pudo actualizar el documento");
      setIsUploading(false);
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    // In a real implementation, upload to S3 here
    // For now, create a mock URL
    const mockUrl = `https://storage.example.com/${familyId}/${file.name}`;

    try {
      await updateDocumentMutation.mutateAsync({
        familyId,
        memberIndex: 0, // Default to first member
        documentoTipo: documentType,
        documentoUrl: mockUrl,
      });
    } catch (error) {
      console.error("Error uploading document:", error);
    }
  };

  const currentDocument = history.find((h: DocumentRecord) => h.documento_tipo === documentType);
  const isLoading_ = isLoading || updateDocumentMutation.isPending || isUploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestionar Documento: {documentType}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Upload Area */}
          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition">
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <Label className="cursor-pointer">
              <span className="text-sm font-medium">Haz clic para cargar o arrastra un archivo</span>
              <Input
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isLoading_}
              />
            </Label>
            <p className="text-xs text-muted-foreground mt-2">PDF, JPG, PNG (máx 10MB)</p>
          </div>

          {/* Current Document */}
          {currentDocument?.documento_url && (
            <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-green-900 dark:text-green-100">
                    Documento Actual
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    {currentDocument.documento_url.split("/").pop()}
                  </p>
                </div>
                <a
                  href={currentDocument.documento_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 hover:text-green-700 dark:text-green-400"
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
            </div>
          )}

          {/* Upload History (Audit Trail) */}
          <div>
            <h3 className="font-semibold text-sm mb-3">Historial de Cargas</h3>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No hay documentos cargados aún
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.map((record: DocumentRecord) => (
                  <div
                    key={record.id}
                    className="p-3 border rounded-lg hover:bg-muted/50 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{record.documento_tipo}</p>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                          {record.fecha_upload && (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(record.fecha_upload).toLocaleString("es-ES")}
                            </div>
                          )}
                          {record.verified_by && (
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              Usuario: {record.verified_by}
                            </div>
                          )}
                        </div>
                        {record.documento_url && (
                          <a
                            href={record.documento_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline mt-2 inline-block"
                          >
                            Ver documento →
                          </a>
                        )}
                      </div>
                      <Badge variant="outline" className="ml-2">
                        {record.documento_url ? "Subido" : "Pendiente"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
