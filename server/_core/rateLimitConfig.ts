export const API_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Kept PER-IP (the default key), NOT per-token: the rate limiter runs before
 * tRPC auth, so the Authorization header here is unverified — keying on it would
 * let anyone rotate bogus bearer values to get a fresh bucket per request and
 * bypass the limiter entirely (a DoS/brute-force hole). IP is the source an
 * attacker cannot freely rotate.
 *
 * The real #166 defect was that 200/15-min was too low: a whole sede behind one
 * NAT shares one IP bucket, and a single Familias tab load fires ~20 procedures,
 * so normal traffic tripped it and the 429 read as a logout. The fix is a
 * generous cap here PLUS the client no longer treating a 429 as "logged out".
 * /api/oauth keeps its own strict 20/15-min brute-force limit.
 */
export const API_MAX = 1200;
