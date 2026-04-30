import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Upload, Download, Calendar, User } from "lucide-react";

interface DeliveryDocumentModalProps {
  familyId: string;
  deliveryId: string;
  deliveryDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DeliveryDocument {
  id: string;
  delivery_id: string;
  recogido_por_documento_url: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export function DeliveryDocumentModal({
  familyId,
  deliveryId,
  deliveryDate,
  open,
  onOpenChange,
}: DeliveryDocumentModalProps) {
  const [isUploading, setIsUploading] = useState(false);

  // Queries
  const { data: documents = [], isLoading, refetch } = (trpc.families as any).getDeliveryDocuments.useQuery(
    { familyId },
    { enabled: open }
  );

  // Mutations
  const uploadDocumentMutation = (trpc.families as any).uploadDeliveryDocument.useMutation({
    onSuccess: () => {
      toast.success("Documento de entrega actualizado exitosamente");
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
    const mockUrl = `https://storage.example.com/${familyId}/delivery-${deliveryId}/${file.name}`;

    try {
      await uploadDocumentMutation.mutateAsync({
        familyId,
        deliveryId,
        documentUrl: mockUrl,
      });
    } catch (error) {
      console.error("Error uploading document:", error);
    }
  };

  const currentDocument = documents.find((d: DeliveryDocument) => d.delivery_id === deliveryId);
  const isLoading_ = isLoading || uploadDocumentMutation.isPending || isUploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Documento de Entrega — {new Date(deliveryDate).toLocaleDateString("es-ES")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Upload Area */}
          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition">
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <Label className="cursor-pointer">
              <span className="text-sm font-medium">
                Haz clic para cargar o arrastra un archivo (Autorización de recogida)
              </span>
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
          {currentDocument?.recogido_por_documento_url && (
            <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-green-900 dark:text-green-100">
                    Documento de Autorización
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    {currentDocument.recogido_por_documento_url.split("/").pop()}
                  </p>
                </div>
                <a
                  href={currentDocument.recogido_por_documento_url}
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
            {currentDocument ? (
              <div className="p-3 border rounded-lg hover:bg-muted/50 transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">Autorización de Recogida</p>
                    <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                      {currentDocument.updated_at && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(currentDocument.updated_at).toLocaleString("es-ES")}
                        </div>
                      )}
                      {currentDocument.verified_by && (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          Usuario: {currentDocument.verified_by}
                        </div>
                      )}
                    </div>
                    {currentDocument.recogido_por_documento_url && (
                      <a
                        href={currentDocument.recogido_por_documento_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-2 inline-block"
                      >
                        Ver documento →
                      </a>
                    )}
                  </div>
                  <Badge variant="default" className="ml-2">
                    Subido
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No hay documentos cargados aún para esta entrega
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
