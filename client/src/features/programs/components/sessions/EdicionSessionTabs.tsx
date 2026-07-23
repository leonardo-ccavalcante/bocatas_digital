/**
 * EdicionSessionTabs.tsx — Session surface for edicion/inscribible programs.
 *
 * Renders the operational view only: session calendar (Tela 1) + session detail (Tela 2).
 * The full compliance dashboard lives in /dashboard (per Leo 2026-07-23 decision).
 * A lightweight glance stat (Planes N/M) is shown in the calendar header via
 * CalendarioSesiones — not the full ComplianceDashboard.
 *
 * State:
 *  - selectedSession: null (calendar view) | SessionListItem (session detail)
 */
import { useState, useCallback } from "react";
import { CalendarioSesiones } from "./CalendarioSesiones";
import { SesionScreen } from "./SesionScreen";
import type { SessionListItem } from "./SesionCalendarRow";

interface EdicionSessionTabsProps {
  programId: string;
  programNombre: string;
  isAdmin: boolean;
}

export function EdicionSessionTabs({ programId, programNombre, isAdmin }: EdicionSessionTabsProps) {
  const [selectedSession, setSelectedSession] = useState<SessionListItem | null>(null);

  const handleSelectSession = useCallback((session: SessionListItem) => {
    setSelectedSession(session);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedSession(null);
  }, []);

  if (selectedSession) {
    return (
      <SesionScreen
        session={selectedSession}
        programId={programId}
        programName={programNombre}
        isAdmin={isAdmin}
        onBack={handleBack}
      />
    );
  }

  return (
    <CalendarioSesiones
      programId={programId}
      isAdmin={isAdmin}
      onSelectSession={handleSelectSession}
    />
  );
}
