import React, { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCsvFlow } from "./_useCsvFlow";
import { useOcrFlow } from "./_useOcrFlow";
import { CsvTab } from "./CsvTab";
import { OcrTab } from "./OcrTab";

interface DeliveryDocumentUploadProps {
  onSuccess?: (batchId: string) => void;
  onError?: (message: string) => void;
}

export const DeliveryDocumentUpload: React.FC<DeliveryDocumentUploadProps> = ({
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<"csv" | "ocr">("csv");

  const csvFlow = useCsvFlow({ onSuccess });
  const ocrFlow = useOcrFlow({ onSuccess });

  // Handle Tab Switch — Clear State of the tab being LEFT,
  // so reopening the same tab keeps progress (matches pre-split behavior).
  const handleTabChange = (tab: "csv" | "ocr") => {
    setActiveTab(tab);
    if (tab === "csv") {
      csvFlow.resetCsv();
    } else {
      ocrFlow.resetOcr();
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as "csv" | "ocr")}>
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="csv">📄 Cargar CSV</TabsTrigger>
          <TabsTrigger value="ocr">
            📸 Escanear Documento
            {ocrFlow.batch.totalCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-600 rounded-full">
                {ocrFlow.batch.totalCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <CsvTab flow={csvFlow} />
        <OcrTab flow={ocrFlow} />
      </Tabs>
    </div>
  );
};
