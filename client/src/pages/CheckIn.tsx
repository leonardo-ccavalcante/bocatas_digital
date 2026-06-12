/**
 * CheckIn.tsx — Main QR Check-in page (Epic B).
 *
 * Layout:
 *   Top bar: sede selector | programa selector | demo mode toggle | offline badge
 *   Main area: idle | scanning | verifying | result states
 *   Bottom: action buttons (Escanear QR | Búsqueda manual | Conteo anónimo)
 */
import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, QrCode, Search, Hash, WifiOff } from "lucide-react";

import { useCheckin } from "@/features/checkin/hooks/useCheckin";
import { QRScanner } from "@/features/checkin/components/QRScanner";
import { ResultCard, RESULT_STATES, type ResultState } from "@/features/checkin/components/ResultCard";
import { ManualSearchModal } from "@/features/checkin/components/ManualSearchModal";
import { LocationSelector } from "@/features/checkin/components/LocationSelector";
import { ProgramSelector } from "@/features/checkin/components/ProgramSelector";
import { DemoModeBanner } from "@/features/checkin/components/DemoModeBanner";
import { OfflinePendingBadge } from "@/features/checkin/components/OfflinePendingBadge";
import { useCheckinStore } from "@/features/checkin/store/useCheckinStore";
import type { CheckinPerson, CheckinPrograma } from "@/features/checkin/machine/checkinMachine";

export default function CheckIn() {
  const { state, send, isOnline, offlineCount, failedCount, isSyncing } = useCheckin();
  const { locationId: storedLocationId, programa: storedPrograma, setLocationId, setPrograma } = useCheckinStore();
  const [showManualSearch, setShowManualSearch] = useState(false);

  // Initialize from Zustand store on mount
  useEffect(() => {
    if (storedLocationId && !state.context.locationId) {
      send({ type: "SET_LOCATION", locationId: storedLocationId });
    }
    if (storedPrograma && state.context.programa !== storedPrograma) {
      send({ type: "SET_PROGRAMA", programa: storedPrograma });
    }
  }, []);

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
  const handleLocationChange = (locationId: string) => {
    send({ type: "SET_LOCATION", locationId });
    setLocationId(locationId);
  };
  const handleProgramaChange = (programa: CheckinPrograma) => {
    send({ type: "SET_PROGRAMA", programa });
    setPrograma(programa);
  };
  const handleDemoToggle = (checked: boolean) =>
    send({ type: "SET_DEMO_MODE", isDemoMode: checked });

  const isResultState = (RESULT_STATES as string[]).includes(currentState);

  return (
    <div className="min-h-full flex flex-col bg-background">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="border-b bg-card px-4 py-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-h2">Check-in</h1>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Offline indicator */}
            {!isOnline && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                <WifiOff className="h-3 w-3" aria-hidden="true" />
                Sin conexión
              </span>
            )}

            {/* Offline queue count */}
            <OfflinePendingBadge count={offlineCount} failedCount={failedCount} isSyncing={isSyncing} />

            {/* Demo mode toggle */}
            <div className="flex items-center gap-2 min-h-[44px]">
              <Switch
                id="demo-mode"
                checked={ctx.isDemoMode}
                onCheckedChange={handleDemoToggle}
                aria-label="Modo demo"
              />
              <Label htmlFor="demo-mode" className="text-sm cursor-pointer select-none">
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
            <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto">
              <QrCode className="w-12 h-12 text-primary" />
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
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Verificando...</p>
          </div>
        )}

        {/* Result states */}
        {isResultState && (
          <ResultCard
            stateValue={currentState as ResultState}
            context={ctx}
            onReset={handleReset}
          />
        )}
      </div>

      {/* ── Action buttons ──────────────────────────────────────────────────── */}
      {(currentState === "idle" || currentState === "scanning") && (
        <div className="border-t bg-card px-4 py-3">
          <div className="max-w-lg mx-auto flex gap-2 flex-wrap justify-center">
            {/* Escanear QR — primary pill */}
            {currentState === "idle" && (
              <button
                type="button"
                className="bocatas-btn-primary flex-1 min-w-32 gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => send({ type: "SCAN_START" })}
                disabled={!ctx.locationId}
                aria-label="Escanear código QR"
              >
                <QrCode className="w-5 h-5" aria-hidden="true" />
                Escanear QR
              </button>
            )}

            {/* Búsqueda manual — outline pill */}
            <button
              type="button"
              className="bocatas-btn-outline flex-1 min-w-32"
              onClick={() => setShowManualSearch(true)}
              disabled={!ctx.locationId}
              aria-label="Búsqueda manual de beneficiario"
            >
              <Search className="w-5 h-5" aria-hidden="true" />
              Búsqueda manual
            </button>

            {/* Conteo anónimo — outline pill */}
            <button
              type="button"
              className="bocatas-btn-outline flex-1 min-w-32"
              onClick={handleAnonymous}
              disabled={!ctx.locationId}
              aria-label="Registrar conteo anónimo"
            >
              <Hash className="w-5 h-5" aria-hidden="true" />
              Conteo anónimo
            </button>
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
