/**
 * CheckIn.tsx — Main QR Check-in page (Epic B).
 *
 * Layout:
 *   Top bar: sede selector | programa selector | demo mode toggle | offline badge
 *   Main area: idle | scanning | verifying | result states
 *   Bottom: action buttons (Escanear QR | Búsqueda manual | Conteo anónimo)
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, QrCode, Search, Hash } from "lucide-react";

import { useCheckin } from "@/features/checkin/hooks/useCheckin";
import { QRScanner } from "@/features/checkin/components/QRScanner";
import { ResultCard } from "@/features/checkin/components/ResultCard";
import { ManualSearchModal } from "@/features/checkin/components/ManualSearchModal";
import { LocationSelector } from "@/features/checkin/components/LocationSelector";
import { ProgramSelector } from "@/features/checkin/components/ProgramSelector";
import { DemoModeBanner } from "@/features/checkin/components/DemoModeBanner";
import { OfflinePendingBadge } from "@/features/checkin/components/OfflinePendingBadge";
import type { CheckinPerson, CheckinPrograma } from "@/features/checkin/machine/checkinMachine";

export default function CheckIn() {
  const { state, send, isOnline, offlineCount, isSyncing } = useCheckin();
  const [showManualSearch, setShowManualSearch] = useState(false);

  const currentState = state.value as string;
  const ctx = state.context;

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleQRDecoded = (value: string) => send({ type: "QR_DECODED", value });
  const handleCancel = () => send({ type: "CANCEL" });
  const handleReset = () => send({ type: "RESET" });
  const handleManualSelect = (person: CheckinPerson) => {
    send({ type: "MANUAL_VERIFY", personId: person.id, person });
  };
  const handleAnonymous = () => send({ type: "ANONYMOUS" });
  const handleLocationChange = (locationId: string) =>
    send({ type: "SET_LOCATION", locationId });
  const handleProgramaChange = (programa: CheckinPrograma) =>
    send({ type: "SET_PROGRAMA", programa });
  const handleDemoToggle = (checked: boolean) =>
    send({ type: "SET_DEMO_MODE", isDemoMode: checked });

  const isResultState = ["registered", "duplicate", "not_found", "error", "offline"].includes(
    currentState
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="border-b bg-card px-4 py-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-lg font-bold">Check-in</h1>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Offline indicator */}
            {!isOnline && (
              <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                Sin conexión
              </span>
            )}
            <OfflinePendingBadge count={offlineCount} isSyncing={isSyncing} />

            {/* Demo mode toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="demo-mode"
                checked={ctx.isDemoMode}
                onCheckedChange={handleDemoToggle}
              />
              <Label htmlFor="demo-mode" className="text-sm cursor-pointer">
                Demo
              </Label>
            </div>
          </div>
        </div>

        {/* Sede + Programa selectors */}
        <div className="flex flex-wrap gap-3">
          <LocationSelector value={ctx.locationId} onChange={handleLocationChange} />
          <ProgramSelector value={ctx.programa} onChange={handleProgramaChange} />
        </div>

        {/* Demo mode banner */}
        {ctx.isDemoMode && <DemoModeBanner />}

        {/* No sede warning */}
        {!ctx.locationId && (
          <p className="text-xs text-amber-600">
            ⚠️ Selecciona una sede para comenzar
          </p>
        )}
      </div>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 max-w-lg mx-auto w-full">

        {/* Idle state */}
        {currentState === "idle" && (
          <div className="text-center space-y-3">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <QrCode className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Listo para escanear</h2>
            <p className="text-sm text-muted-foreground">
              Escanea el código QR del beneficiario o usa la búsqueda manual
            </p>
          </div>
        )}

        {/* Scanning state */}
        {currentState === "scanning" && (
          <QRScanner
            onDecoded={handleQRDecoded}
            onCancel={handleCancel}
            isDemoMode={ctx.isDemoMode}
          />
        )}

        {/* Verifying state */}
        {currentState === "verifying" && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Verificando...</p>
          </div>
        )}

        {/* Result states */}
        {isResultState && (
          <ResultCard
            stateValue={currentState as "registered" | "duplicate" | "not_found" | "error" | "offline"}
            context={ctx}
            onReset={handleReset}
          />
        )}
      </div>

      {/* ── Action buttons ──────────────────────────────────────────────────── */}
      {(currentState === "idle" || currentState === "scanning") && (
        <div className="border-t bg-card px-4 py-4">
          <div className="max-w-lg mx-auto flex gap-3 flex-wrap justify-center">
            {currentState === "idle" && (
              <Button
                size="lg"
                className="gap-2 flex-1 min-w-36"
                onClick={() => send({ type: "SCAN_START" })}
                disabled={!ctx.locationId}
              >
                <QrCode className="w-5 h-5" />
                Escanear QR
              </Button>
            )}

            <Button
              size="lg"
              variant="outline"
              className="gap-2 flex-1 min-w-36"
              onClick={() => setShowManualSearch(true)}
              disabled={!ctx.locationId}
            >
              <Search className="w-5 h-5" />
              Búsqueda manual
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="gap-2 flex-1 min-w-36"
              onClick={handleAnonymous}
              disabled={!ctx.locationId}
            >
              <Hash className="w-5 h-5" />
              Conteo anónimo
            </Button>
          </div>
        </div>
      )}

      {/* ── Manual search modal ─────────────────────────────────────────────── */}
      <ManualSearchModal
        open={showManualSearch}
        onClose={() => setShowManualSearch(false)}
        onSelect={handleManualSelect}
      />
    </div>
  );
}
