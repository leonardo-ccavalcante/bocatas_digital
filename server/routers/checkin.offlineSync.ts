/**
 * checkin.offlineSync.ts — pure helpers for the offline check-in queue flush.
 *
 * Extracted from checkin.ts so the date-derivation (ARG-02) and result-mapping
 * are unit-testable in isolation and the router stays within the file budget.
 */

// Mirror ProgramaSlug / MetodoEnum in checkin.ts. Program slugs come from the
// dynamic `programs` catalog (validated by the FK on attendances.programa), so
// this is a plain string, not a literal union.
type CheckinPrograma = string;
type CheckinMetodo = "qr_scan" | "manual_busqueda" | "conteo_anonimo";

export interface OfflineSyncItem {
  clientId: string;
  personId: string | null;
  locationId: string;
  programa: CheckinPrograma;
  metodo: CheckinMetodo;
  isDemoMode: boolean;
  /** ISO-8601 instant the check-in was captured on the device. */
  queuedAt: string;
}

export interface EnrichedOfflineItem {
  item: OfflineSyncItem;
  checkedInAt: string;
  checkedInDate: string;
}

export interface OfflineSyncResult {
  clientId: string;
  status: "synced" | "duplicate";
}

/**
 * ARG-02: derive checked_in_at + checked_in_date per item from the device
 * capture moment (queuedAt), NOT the server flush time — a check-in made at
 * 23:55 offline and flushed after midnight must record the day it happened.
 */
export function enrichOfflineItems(input: OfflineSyncItem[]): EnrichedOfflineItem[] {
  return input.map((item) => {
    const iso = new Date(item.queuedAt).toISOString();
    return { item, checkedInAt: iso, checkedInDate: iso.slice(0, 10) };
  });
}

/**
 * Build the attendance rows handed to the idempotent upsert.
 *
 * ARG-01 / B.7: demo (practice) check-ins write NO real data — they are
 * filtered out here so a demo check-in can never occupy a real check-in's
 * unique slot. The returned rows are therefore always es_demo = false.
 */
export function offlineAttendanceRows(enriched: EnrichedOfflineItem[]) {
  return enriched
    .filter(({ item }) => !item.isDemoMode)
    .map(({ item, checkedInAt, checkedInDate }) => ({
      person_id: item.personId,
      location_id: item.locationId,
      programa: item.programa,
      metodo: item.metodo,
      es_demo: false,
      checked_in_at: checkedInAt,
      checked_in_date: checkedInDate,
    }));
}

/**
 * Map each input item to its sync status by membership in the set of keys the
 * DB actually inserted. Demo items (never persisted, ARG-01) and anonymous
 * (person_id null) rows bypass the unique arbiter and are always "synced" so
 * they leave the queue. The key uses the per-item derived date so it matches
 * what the upsert wrote.
 */
export function offlineSyncResults(
  enriched: EnrichedOfflineItem[],
  insertedKeys: Set<string>,
): OfflineSyncResult[] {
  return enriched.map(({ item, checkedInDate }) => {
    if (item.isDemoMode || item.personId === null) {
      return { clientId: item.clientId, status: "synced" };
    }
    const key = `${item.personId}|${item.locationId}|${item.programa}|${checkedInDate}`;
    return {
      clientId: item.clientId,
      status: insertedKeys.has(key) ? "synced" : "duplicate",
    };
  });
}
