/**
 * dashboard.realtime.integration.test.ts — Phase A.3.1
 *
 * End-to-end Supabase Realtime integration test for the `attendances`
 * channel. The dashboard's KPI cards depend on Supabase Realtime delivering
 * INSERT events on `attendances` in < 5s (CLAUDE.md §1 Gate 1 acceptance).
 *
 * This test only runs when SUPABASE_LOCAL=1 is set (i.e. a local Supabase
 * stack is up and reachable on the standard ports). When the env var is
 * missing, the suite is *skipped*, never mocked — per the project rule
 * "don't mock the database for realtime tests" (mocking would defeat the
 * purpose: we want to verify the wire protocol, RLS visibility, and the
 * < 5s freshness budget against a real Postgres + Realtime).
 *
 * To run locally:
 *   1. supabase start
 *   2. SUPABASE_LOCAL=1 \
 *      SUPABASE_URL=http://127.0.0.1:54321 \
 *      SUPABASE_SERVICE_ROLE_KEY=... \
 *      pnpm test server/__tests__/dashboard.realtime.integration.test.ts
 *
 * If you change `useRealtimeAttendance.ts`, run this test on a real local
 * stack before merging — CI cannot run it (no Supabase available there).
 *
 * TODO(Phase A.9 / Realtime stress test): expand to subscribe → INSERT → assert
 *   freshness < 5s p95 across 50 inserts, and verify es_demo=true rows do NOT
 *   trigger invalidation (matches the filter in useRealtimeAttendance.ts).
 */
import { describe, it, expect } from "vitest";
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";

const SUPABASE_LOCAL = process.env.SUPABASE_LOCAL === "1";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

interface AttendanceRow {
  id?: string;
  person_id: string | null;
  location_id: string | null;
  programa: string;
  metodo: string;
  es_demo: boolean;
  checked_in_date: string;
}

/** Wait for `predicate` to be true, polling every 100ms, up to `timeoutMs`. */
async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return predicate();
}

describe.skipIf(!SUPABASE_LOCAL)(
  "dashboard.realtime — INSERT → subscriber receives event (integration)",
  () => {
    it("subscriber receives an attendances INSERT within 5s", async () => {
      // Guard: even when SUPABASE_LOCAL=1 is set, ensure URL + key are present.
      // Better to fail loudly than to silently pass with a half-configured stack.
      expect(SUPABASE_URL).toMatch(/^https?:\/\//);
      expect(SUPABASE_SERVICE_ROLE_KEY.length).toBeGreaterThan(20);

      const client: SupabaseClient = createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } },
      );

      const received: Array<Record<string, unknown>> = [];
      let channel: RealtimeChannel | null = null;

      try {
        channel = client
          .channel("attendances-live-it")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "attendances" },
            (payload) => {
              received.push(payload.new as Record<string, unknown>);
            },
          );

        // Wait for SUBSCRIBED before INSERTing — otherwise the event is missed.
        const subscribed = await new Promise<boolean>((resolve) => {
          channel?.subscribe((status) => {
            if (status === "SUBSCRIBED") resolve(true);
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              resolve(false);
            }
          });
        });
        expect(subscribed).toBe(true);

        const today = new Date().toISOString().split("T")[0];
        const row: AttendanceRow = {
          person_id: null, // anonymous keeps the test independent of seed data
          location_id: null,
          programa: "comedor",
          metodo: "conteo_anonimo",
          es_demo: false,
          checked_in_date: today,
        };

        const { error } = await client.from("attendances").insert(row);
        expect(error).toBeNull();

        const arrived = await waitFor(() => received.length > 0, 5_000);
        expect(arrived).toBe(true);
        expect(received[0]).toMatchObject({
          programa: "comedor",
          metodo: "conteo_anonimo",
          es_demo: false,
        });
      } finally {
        if (channel) await client.removeChannel(channel);
      }
    }, 15_000);
  },
);

// When the env var is unset, vitest reports the suite as skipped.
// We add one always-on smoke assertion so the file never reports "no tests"
// and to make the skip-reason visible in test output.
describe("dashboard.realtime — env gate", () => {
  it.skipIf(SUPABASE_LOCAL)(
    "skipped: set SUPABASE_LOCAL=1 + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run the live realtime test",
    () => {
      // Intentional no-op — visibility marker for CI logs.
      expect(true).toBe(true);
    },
  );
});
