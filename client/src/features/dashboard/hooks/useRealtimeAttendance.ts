/**
 * useRealtimeAttendance — subscribes to Supabase Realtime for attendances INSERT.
 * On new non-demo check-in: invalidates KPI + trend queries.
 * Returns connection status for UI indicator.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Singleton Supabase client for Realtime (frontend)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type RealtimeStatus = "connecting" | "connected" | "disconnected";

export function useRealtimeAttendance() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  useEffect(() => {
    const channel = supabase
      .channel("attendances-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attendances" },
        (payload) => {
          // Only invalidate for real (non-demo) check-ins
          if (!payload.new.es_demo) {
            utils.dashboard.getKPIStats.invalidate();
            utils.dashboard.getTrendData.invalidate();
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setStatus("connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setStatus("disconnected");
        } else if (status === "CLOSED") {
          setStatus("disconnected");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { status };
}
