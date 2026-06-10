/**
 * useRealtimeAttendance — subscribes to Supabase Realtime for attendances INSERT.
 * On new non-demo check-in: invalidates KPI + trend queries.
 * Returns connection status for UI indicator.
 * Re-subscribes on CHANNEL_ERROR/TIMED_OUT/CLOSED with bounded exponential backoff
 * (max 5 attempts, capped at 30 s delay).
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Singleton Supabase client for Realtime (frontend)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export type RealtimeStatus = "connecting" | "connected" | "disconnected";

export function useRealtimeAttendance() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const attemptsRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let destroyed = false;

    function subscribe() {
      if (destroyed) return;
      setStatus("connecting");

      channel = supabase
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
        .subscribe((channelStatus) => {
          if (channelStatus === "SUBSCRIBED") {
            attemptsRef.current = 0;
            setStatus("connected");
          } else if (
            channelStatus === "CHANNEL_ERROR" ||
            channelStatus === "TIMED_OUT" ||
            channelStatus === "CLOSED"
          ) {
            setStatus("disconnected");
            if (channel) {
              supabase.removeChannel(channel);
              channel = null;
            }
            if (attemptsRef.current < MAX_RECONNECT_ATTEMPTS && !destroyed) {
              const delay = Math.min(
                BASE_RECONNECT_DELAY_MS * Math.pow(2, attemptsRef.current),
                MAX_RECONNECT_DELAY_MS
              );
              attemptsRef.current += 1;
              retryTimerRef.current = setTimeout(subscribe, delay);
            }
          }
        });
    }

    subscribe();

    return () => {
      destroyed = true;
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { status };
}
