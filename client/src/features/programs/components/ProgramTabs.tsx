import { lazy, Suspense } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useTabParam, PROGRAM_TABS, ENABLED_TABS, type ProgramTab } from "../hooks/useTabParam";

const FamiliasTab = lazy(() => import("@/features/familias-tab"));
const UploadsTab = lazy(() => import("@/features/uploads-tab"));

interface Program {
  id: string;
  slug: string;
  nombre: string;
}

interface ProgramTabsProps {
  program: Program;
}

const TAB_LABELS: Record<ProgramTab, string> = {
  familias: "Familias",
  mapa: "Mapa",
  reports: "Reports",
  uploads: "Uploads",
  derivar: "Derivar",
};

const TabFallback = () => (
  <div className="flex items-center justify-center py-12">
    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
  </div>
);

/**
 * Tab strip rendered inside /programas/programa_familias. Returns null for
 * any other slug so other programs render their existing single-page UI
 * unchanged. Tabs not in ENABLED_TABS show a "Próximamente" tooltip.
 */
export function ProgramTabs({ program }: ProgramTabsProps) {
  const [tab, setTab] = useTabParam();

  if (program.slug !== "programa_familias") {
    return null;
  }

  const renderTrigger = (key: ProgramTab) => {
    const enabled = ENABLED_TABS.includes(key);
    if (enabled) {
      return (
        <TabsTrigger key={key} value={key}>
          {TAB_LABELS[key]}
        </TabsTrigger>
      );
    }
    return (
      <Tooltip key={key}>
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            <TabsTrigger value={key} disabled aria-label={`${TAB_LABELS[key]} (próximamente)`}>
              {TAB_LABELS[key]}
            </TabsTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent>Próximamente</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        // Defensive: Radix sends back the exact value strings we provide,
        // so v should always be a ProgramTab. Guard anyway in case a disabled
        // trigger somehow fires (it shouldn't), preventing setTab from receiving
        // a non-ProgramTab string.
        if (PROGRAM_TABS.includes(v as ProgramTab)) {
          setTab(v as ProgramTab);
        }
      }}
      className="w-full"
    >
      <TabsList>
        {PROGRAM_TABS.map(renderTrigger)}
      </TabsList>

      <TabsContent value="familias">
        <Suspense fallback={<TabFallback />}>
          {ENABLED_TABS.includes("familias") && <FamiliasTab programaId={program.id} />}
        </Suspense>
      </TabsContent>

      <TabsContent value="uploads">
        <Suspense fallback={<TabFallback />}>
          {ENABLED_TABS.includes("uploads") && <UploadsTab programaId={program.id} />}
        </Suspense>
      </TabsContent>

      {/* Mapa, Reports, Derivar TabsContent intentionally absent in Phase 1.
          Disabled triggers prevent navigation, so empty content panes are unreachable.
          Phase 2 + 3 add their TabsContent at the same time as enabling them. */}
    </Tabs>
  );
}
