/**
 * PendingItemsPanel — Job 8
 * Shows per-member pending items: missing consents (≥14yo), missing documents.
 * Used in FamiliaDetalle Documentación tab and at check-in (Cross-Epic).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, FileText, FileSignature } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface PendingItemsProps {
  familyId: string;
}

interface PendingItem {
  type: "consent" | "document";
  member_name: string;
  description: string;
}

export function PendingItemsPanel({ familyId }: PendingItemsProps) {
  const { data, isLoading } = trpc.families.getPendingItems.useQuery(
    { family_id: familyId },
    { enabled: Boolean(familyId) }
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Cargando pendientes…
        </CardContent>
      </Card>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: PendingItem[] = (data as any) ?? [];

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Documentación completa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Todos los miembros tienen sus documentos y consentimientos al día.
          </p>
        </CardContent>
      </Card>
    );
  }

  const consentItems = items.filter((i) => i.type === "consent");
  const docItems = items.filter((i) => i.type === "document");

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          Pendientes
          <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-800">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {consentItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <FileSignature className="h-3.5 w-3.5" />
              Consentimientos pendientes
            </p>
            <ul className="space-y-1.5">
              {consentItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">{item.member_name}</span>
                    <span className="text-muted-foreground"> — {item.description}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {docItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Documentos pendientes
            </p>
            <ul className="space-y-1.5">
              {docItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">{item.member_name}</span>
                    <span className="text-muted-foreground"> — {item.description}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
