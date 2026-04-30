import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

export interface ValidationWarning {
  type: "error" | "warning" | "info" | "success";
  message: string;
  rowIndex?: number;
  field?: string;
}

interface ValidationWarningsProps {
  warnings: ValidationWarning[];
  onDismiss?: (index: number) => void;
}

/**
 * Display validation warnings and errors from OCR extraction
 * Groups messages by type and shows severity indicators
 */
export function ValidationWarnings({
  warnings,
  onDismiss,
}: ValidationWarningsProps) {
  if (warnings.length === 0) {
    return null;
  }

  const errorCount = warnings.filter((w) => w.type === "error").length;
  const warningCount = warnings.filter((w) => w.type === "warning").length;

  return (
    <div className="space-y-3">
      {/* Summary alert if there are errors */}
      {errorCount > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Errores encontrados</AlertTitle>
          <AlertDescription>
            {errorCount} error{errorCount !== 1 ? "es" : ""} que deben corregirse
            antes de guardar
          </AlertDescription>
        </Alert>
      )}

      {/* Individual warnings */}
      {warnings.map((warning, idx) => {
        const Icon =
          warning.type === "error"
            ? AlertCircle
            : warning.type === "warning"
              ? AlertTriangle
              : warning.type === "success"
                ? CheckCircle2
                : AlertCircle;

        const variant =
          warning.type === "error"
            ? "destructive"
            : warning.type === "warning"
              ? "default"
              : "default";

        return (
          <Alert key={idx} variant={variant}>
            <Icon className="h-4 w-4" />
            <AlertTitle className="capitalize">{warning.type}</AlertTitle>
            <AlertDescription>
              {warning.rowIndex !== undefined && (
                <span className="text-xs text-muted-foreground">
                  Fila {warning.rowIndex + 1}
                  {warning.field && ` - Campo: ${warning.field}`}
                  {" • "}
                </span>
              )}
              {warning.message}
            </AlertDescription>
          </Alert>
        );
      })}

      {/* Summary stats */}
      {(errorCount > 0 || warningCount > 0) && (
        <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
          {errorCount > 0 && (
            <div>
              🔴 {errorCount} error{errorCount !== 1 ? "es" : ""}
            </div>
          )}
          {warningCount > 0 && (
            <div>
              🟡 {warningCount} advertencia{warningCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
