/**
 * TemplatesGrid.tsx — 9-card grid grouped in 3 sections.
 *
 * Sections: Operacional · Compliance · Financiadores
 * Each card triggers onOpen(templateKey) — the parent decides which modal to mount.
 *
 * Accessibility: each card button has aria-label and is keyboard focusable.
 * shadcn Card + Button primitives only.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  FileText,
  AlertCircle,
  Shield,
  Clock,
  FolderOpen,
  BarChart2,
  MapPin,
  TrendingUp,
  FileBarChart,
} from "lucide-react";

export type TemplateKey =
  | "familiasAtendidas"
  | "padronPorVencer"
  | "informesPorRenovar"
  | "complianceSnapshot"
  | "familiasEnRiesgo"
  | "documentosFaltantes"
  | "resumenTrimestral"
  | "distribucionPorDistrito"
  | "evolucionHistorica"
  | "irpfDemografico";

interface TemplateCardDef {
  key: TemplateKey;
  title: string;
  description: string;
  icon: React.ElementType;
}

const OPERACIONAL: TemplateCardDef[] = [
  {
    key: "familiasAtendidas",
    title: "Familias atendidas",
    description: "Familias registradas en un período. Exportable a CSV.",
    icon: Users,
  },
  {
    key: "padronPorVencer",
    title: "Padrón por vencer",
    description: "Familias cuyo padrón municipal caduca próximamente.",
    icon: Clock,
  },
  {
    key: "informesPorRenovar",
    title: "Informes por renovar",
    description: "Informes sociales próximos a renovación anual.",
    icon: FileText,
  },
  {
    key: "documentosFaltantes",
    title: "Documentos faltantes",
    description: "Familias con documentación requerida sin subir.",
    icon: FolderOpen,
  },
];

const COMPLIANCE: TemplateCardDef[] = [
  {
    key: "complianceSnapshot",
    title: "Compliance",
    description: "Estado actual de indicadores CM-1 a CM-6.",
    icon: Shield,
  },
  {
    key: "familiasEnRiesgo",
    title: "Familias en riesgo",
    description: "Familias con al menos un indicador de cumplimiento en rojo.",
    icon: AlertCircle,
  },
];

const FINANCIADORES: TemplateCardDef[] = [
  {
    key: "resumenTrimestral",
    title: "Resumen trimestral",
    description: "KPIs trimestrales: nuevas familias, entregas, distribución.",
    icon: BarChart2,
  },
  {
    key: "distribucionPorDistrito",
    title: "Distribución por distrito",
    description: "Familias activas agrupadas por distrito de Madrid.",
    icon: MapPin,
  },
  {
    key: "evolucionHistorica",
    title: "Evolución histórica",
    description: "Nuevas familias por mes en los últimos 12 meses.",
    icon: TrendingUp,
  },
  {
    key: "irpfDemografico",
    title: "IRPF Demográfico",
    description:
      "Desglose demográfico anual (edad, género, estudios, empleo, nacionalidad) para justificación de subvenciones IRPF.",
    icon: FileBarChart,
  },
];

interface SectionProps {
  title: string;
  cards: TemplateCardDef[];
  onOpen: (key: TemplateKey) => void;
}

function Section({ title, cards, onOpen }: SectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.key} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <p className="text-xs text-muted-foreground">{card.description}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  aria-label={card.title}
                  onClick={() => onOpen(card.key)}
                >
                  Ver informe
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

interface TemplatesGridProps {
  onOpen: (key: TemplateKey) => void;
}

export function TemplatesGrid({ onOpen }: TemplatesGridProps) {
  return (
    <div className="space-y-6">
      <Section title="Operacional" cards={OPERACIONAL} onOpen={onOpen} />
      <Section title="Compliance" cards={COMPLIANCE} onOpen={onOpen} />
      <Section title="Financiadores" cards={FINANCIADORES} onOpen={onOpen} />
    </div>
  );
}
