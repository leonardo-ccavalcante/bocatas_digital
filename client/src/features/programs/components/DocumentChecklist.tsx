/**
 * DocumentChecklist.tsx — D-F1: Reusable building block for document checklist.
 * Used by Task 6 (Familia intake) and any program that requires document tracking.
 *
 * Props:
 *   - items: list of document items with label, required flag, and checked state
 *   - onChange: callback when a document is checked/unchecked
 *   - readOnly: if true, checkboxes are disabled
 *   - title: optional section title
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FileText, CheckCircle2, AlertCircle } from "lucide-react";

export interface DocumentItem {
  id: string;
  label: string;
  description?: string;
  required: boolean;
  checked: boolean;
  /** Optional: URL to a scanned/uploaded document */
  documentUrl?: string | null;
}

interface DocumentChecklistProps {
  items: DocumentItem[];
  onChange?: (id: string, checked: boolean) => void;
  /**
   * If provided, render a button instead of a plain anchor for "Ver" links.
   * The callback receives the item; the caller resolves the signed URL and opens it.
   * When omitted, the component falls back to rendering `<a href={item.documentUrl}>`.
   */
  onViewDocument?: (item: DocumentItem) => void | Promise<void>;
  readOnly?: boolean;
  title?: string;
  className?: string;
}

export function DocumentChecklist({
  items,
  onChange,
  onViewDocument,
  readOnly = false,
  title = "Documentación requerida",
  className,
}: DocumentChecklistProps) {
  const requiredItems = items.filter((i) => i.required);
  const allRequiredChecked = requiredItems.every((i) => i.checked);
  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {allRequiredChecked ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completo
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              {checkedCount}/{items.length}
            </span>
          )}
        </div>
      </div>

      {/* Document items */}
      <div className="rounded-lg border divide-y">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-start gap-3 px-3 py-2.5 transition-colors",
              !readOnly && "hover:bg-muted/30",
              item.checked && "bg-emerald-50/50 dark:bg-emerald-950/20"
            )}
          >
            <Checkbox
              id={`doc-${item.id}`}
              checked={item.checked}
              onCheckedChange={(checked) => onChange?.(item.id, checked === true)}
              disabled={readOnly}
              className="mt-0.5 shrink-0"
            />
            <label
              htmlFor={`doc-${item.id}`}
              className={cn(
                "flex-1 cursor-pointer",
                readOnly && "cursor-default"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-sm font-medium",
                    item.checked ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
                {item.required && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 border-amber-300 text-amber-700 bg-amber-50"
                  >
                    Requerido
                  </Badge>
                )}
              </div>
              {item.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
              )}
            </label>
            {item.documentUrl && (
              onViewDocument ? (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onViewDocument(item);
                  }}
                >
                  Ver
                </button>
              ) : (
                <a
                  href={item.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  Ver
                </a>
              )
            )}
          </div>
        ))}
      </div>

      {/* Summary for required items */}
      {requiredItems.length > 0 && !allRequiredChecked && (
        <p className="text-xs text-amber-600">
          {requiredItems.filter((i) => !i.checked).length} documento(s) obligatorio(s) pendiente(s).
        </p>
      )}
    </div>
  );
}
