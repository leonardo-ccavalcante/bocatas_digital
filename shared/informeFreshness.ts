// Single source of truth for the informe-social freshness threshold.
//
// The server (documentService.validateContext) and the client
// (SocialReportPanel blockingError) MUST agree on when an informe social is
// "vencido" — so the rule lives here and is imported by both. Do not inline the
// 365-day comparison anywhere else.

/** Days after which an informe social's last follow-up is considered stale. */
export const STALE_INFORME_DAYS = 365;

const MS_PER_DAY = 86_400_000;

/**
 * True when the given follow-up date is older than STALE_INFORME_DAYS.
 *
 * Callers must handle a missing date (null/empty) separately — a missing
 * seguimiento is a distinct condition ("sin seguimientos") from a stale one
 * ("vencido"). This assumes a valid ISO (YYYY-MM-DD) date string.
 */
export function isInformeStale(fecha: string): boolean {
  return (Date.now() - new Date(fecha).getTime()) / MS_PER_DAY > STALE_INFORME_DAYS;
}
