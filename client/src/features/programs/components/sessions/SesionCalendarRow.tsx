/**
 * SesionCalendarRow.tsx — A single session row in the calendar list.
 * Shows estado chip, date/time, responsable, and per-estado action buttons.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SesionEstadoChip } from "./SesionEstadoChip";
import { CancelarSesionDialog } from "./CancelarSesionDialog";
import { ReprogramarSesionDialog } from "./ReprogramarSesionDialog";
import type { SessionEstado } from "@shared/sessionSchemas";

import type { Json } from "@/lib/database.types";

export interface SessionListItem {
  id: string;
  fecha: string;
  estado: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  responsable_nombre: string | null;
  // Json from Supabase generated types — may be any JSON value
  session_data: Json | null;
  motivo_cancelacion: string | null;
  closed_at: string | null;
}

interface SesionCalendarRowProps {
  session: SessionListItem;
  isAdmin: boolean;
  isLoadingAbrir?: boolean;
  isLoadingCancelar?: boolean;
  isLoadingReprogramar?: boolean;
  onAbrir: (sessionId: string) => void;
  onCancelar: (sessionId: string, motivo: string) => void;
  onReprogramar: (sessionId: string, values: { fecha: string; hora_inicio?: string; hora_fin?: string }) => void;
  onSelect: (session: SessionListItem) => void;
}

function formatHorario(inicio: string | null, fin: string | null): string {
  if (!inicio && !fin) return "Sin horario";
  if (!fin) return inicio ?? "";
  return `${inicio} – ${fin}`;
}

export function SesionCalendarRow({
  session,
  isAdmin,
  isLoadingAbrir = false,
  isLoadingCancelar = false,
  isLoadingReprogramar = false,
  onAbrir,
  onCancelar,
  onReprogramar,
  onSelect,
}: SesionCalendarRowProps) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reprogramarOpen, setReprogramarOpen] = useState(false);
  const estado = session.estado as SessionEstado;
  const isCancelada = estado === "cancelada";

  return (
    <div
      className={`flex flex-wrap items-center gap-3 px-4 py-3 border-b last:border-b-0 ${
        isCancelada ? "opacity-50 bg-muted/30" : "hover:bg-muted/20"
      }`}
    >
      {/* Date + time */}
      <div className="min-w-[110px]">
        <p className={`text-sm font-medium ${isCancelada ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {session.fecha}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatHorario(session.hora_inicio, session.hora_fin)}
        </p>
      </div>

      {/* Estado */}
      <SesionEstadoChip estado={estado} />

      {/* Responsable + motivo */}
      <div className="flex-1 min-w-0">
        {session.responsable_nombre && (
          <p className="text-xs text-muted-foreground truncate">
            {session.responsable_nombre}
          </p>
        )}
        {isCancelada && session.motivo_cancelacion && (
          <p className="text-xs text-destructive/80 italic truncate" title={session.motivo_cancelacion}>
            Motivo: {session.motivo_cancelacion}
          </p>
        )}
      </div>

      {/* Actions */}
      {!isCancelada && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {(estado === "planificada" || estado === "abierta") && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => onSelect(session)}
            >
              Ver sesión
            </Button>
          )}
          {estado === "cerrada" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => onSelect(session)}
            >
              Ver registro
            </Button>
          )}
          {isAdmin && estado === "planificada" && (
            <>
              <Button
                size="sm"
                variant="default"
                className="text-xs"
                disabled={isLoadingAbrir}
                onClick={() => onAbrir(session.id)}
              >
                {isLoadingAbrir ? "Abriendo..." : "Abrir"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs"
                onClick={() => setReprogramarOpen(true)}
              >
                Reprogramar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-destructive hover:text-destructive"
                onClick={() => setCancelOpen(true)}
              >
                Cancelar
              </Button>
            </>
          )}
          {isAdmin && estado === "abierta" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-destructive hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              Cancelar
            </Button>
          )}
        </div>
      )}

      <CancelarSesionDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        sessionFecha={session.fecha}
        isLoading={isLoadingCancelar}
        onConfirm={(motivo) => {
          onCancelar(session.id, motivo);
          setCancelOpen(false);
        }}
      />
      <ReprogramarSesionDialog
        open={reprogramarOpen}
        onOpenChange={setReprogramarOpen}
        currentFecha={session.fecha}
        currentHoraInicio={session.hora_inicio}
        currentHoraFin={session.hora_fin}
        isLoading={isLoadingReprogramar}
        onConfirm={(values) => {
          onReprogramar(session.id, values);
          setReprogramarOpen(false);
        }}
      />
    </div>
  );
}
