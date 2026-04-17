import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Upload, AlertTriangle, CheckCircle, Loader2, Download, FileText } from "lucide-react";

interface ImportFamiliesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess?: () => void;
}

type MergeStrategy = "overwrite" | "merge" | "skip";

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recordCount: number;
}

export function ImportFamiliesModal({ open, onOpenChange, onImportSuccess }: ImportFamiliesModalProps) {
  const [csvContent, setCSVContent] = useState<string>("");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>("merge");
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const validateMutation = (trpc.families as any).validateCSVImport.useQuery(
    { csv: csvContent },
    { enabled: false }
  );

  const importMutation = (trpc.families as any).importFamilies.useMutation({
    onSuccess: (result: any) => {
      toast.success(
        `${result.successCount} familias importadas exitosamente${result.errorCount > 0 ? `, ${result.errorCount} errores` : ""}`
      );
      setCSVContent("");
      setValidationResult(null);
      onOpenChange(false);
      onImportSuccess?.();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al importar");
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setCSVContent(content);
      setValidationResult(null);
    } catch (error) {
      toast.error("Error al leer el archivo");
    }
  };

  const handleValidate = async () => {
    if (!csvContent.trim()) {
      toast.error("Por favor carga un archivo CSV");
      return;
    }

    setIsValidating(true);
    try {
      const result = await validateMutation.refetch();
      setValidationResult(result.data as ValidationResult);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al validar");
    } finally {
      setIsValidating(false);
    }
  };

  const handleImport = async () => {
    if (!validationResult?.isValid) {
      toast.error("Por favor valida el CSV primero");
      return;
    }

    setIsImporting(true);
    try {
      await importMutation.mutateAsync({
        csv: csvContent,
        mergeStrategy,
      });
    } catch (error) {
      console.error("Import error:", error);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Familias desde CSV</DialogTitle>
          <DialogDescription>
            Carga un archivo CSV para importar o actualizar familias en lote
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template & Guide Links */}
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">¿Necesitas ayuda?</p>
                <div className="flex flex-wrap gap-2">
                  <a href="/familias-template.csv" download className="inline-flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition">
                    <Download className="w-3 h-3" /> Descargar Plantilla
                  </a>
                  <a href="/CSV-IMPORT-GUIDE.md" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100 px-3 py-1 rounded transition">
                    <FileText className="w-3 h-3" /> Ver Guía
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <Label htmlFor="csv-file" className="text-base font-medium mb-2 block">
              Archivo CSV
            </Label>
            <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <Label htmlFor="csv-file" className="cursor-pointer">
                <span className="text-sm font-medium">
                  Haz clic para cargar o arrastra un archivo CSV
                </span>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isValidating || isImporting}
                />
              </Label>
              <p className="text-xs text-muted-foreground mt-2">
                {csvContent ? `${csvContent.split("\n").length - 1} filas cargadas` : "Máx 10MB"}
              </p>
            </div>
          </div>

          {/* Validation Results */}
          {validationResult && (
            <div className="space-y-3">
              {validationResult.isValid ? (
                <Alert className="border-green-200 bg-green-50 dark:bg-green-950">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    ✓ CSV válido: {validationResult.recordCount} familias para importar
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-red-200 bg-red-50 dark:bg-red-950">
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <AlertDescription className="text-red-800 dark:text-red-200">
                    ✗ CSV inválido: {validationResult.errors.length} errores encontrados
                  </AlertDescription>
                </Alert>
              )}

              {validationResult.errors.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Errores</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1 text-xs text-red-700 dark:text-red-300">
                      {validationResult.errors.slice(0, 5).map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                      {validationResult.errors.length > 5 && (
                        <li>• ... y {validationResult.errors.length - 5} más</li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {validationResult.warnings.length > 0 && (
                <Card className="border-yellow-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Advertencias</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1 text-xs text-yellow-700 dark:text-yellow-300">
                      {validationResult.warnings.slice(0, 3).map((warning, i) => (
                        <li key={i}>⚠ {warning}</li>
                      ))}
                      {validationResult.warnings.length > 3 && (
                        <li>⚠ ... y {validationResult.warnings.length - 3} más</li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Merge Strategy (only show if validation passed) */}
          {validationResult?.isValid && (
            <div>
              <Label htmlFor="merge-strategy" className="text-base font-medium mb-2 block">
                Estrategia de Fusión
              </Label>
              <Select value={mergeStrategy} onValueChange={(value) => setMergeStrategy(value as MergeStrategy)}>
                <SelectTrigger id="merge-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">
                    <div>
                      <p className="font-medium">Fusionar (Recomendado)</p>
                      <p className="text-xs text-muted-foreground">Mantiene datos existentes, llena vacíos</p>
                    </div>
                  </SelectItem>
                  <SelectItem value="overwrite">
                    <div>
                      <p className="font-medium">Sobrescribir</p>
                      <p className="text-xs text-muted-foreground">Reemplaza todos los campos</p>
                    </div>
                  </SelectItem>
                  <SelectItem value="skip">
                    <div>
                      <p className="font-medium">Saltar Existentes</p>
                      <p className="text-xs text-muted-foreground">Solo crea nuevas familias</p>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isValidating || isImporting}>
              Cancelar
            </Button>
            {!validationResult && (
              <Button onClick={handleValidate} disabled={!csvContent || isValidating}>
                {isValidating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Validando...
                  </>
                ) : (
                  "Validar CSV"
                )}
              </Button>
            )}
            {validationResult?.isValid && (
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  "Importar Familias"
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
