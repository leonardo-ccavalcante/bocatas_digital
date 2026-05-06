# Professional Logging System (reference)

> **Archived 2026-05-05** (was 374 lines, distilled to ≤150).
> **Live code:** `server/_core/logger.ts`, `server/_core/logging-middleware.ts`, `server/routers/logging.ts`, `server/_core/context.ts`.
> **Tests:** `server/__tests__/logger.test.ts`, `logging-middleware.test.ts`, `logging-router.test.ts` (41 tests total).

## What it does

Production-grade in-process logging with **correlation IDs**, **structured JSON output**, and a **ring buffer** (default 1000 entries, configurable). Zero persistent storage by design — query and export via admin tRPC endpoints. Negligible per-request overhead (< 5 ms middleware, < 1 ms per log).

## Components

1. **Logger** — `server/_core/logger.ts` — ring buffer + level-typed methods (`debug/info/warn/error`)
2. **tRPC context integration** — `server/_core/context.ts` — adds `correlationId` (UUID) + per-request `Logger` instance + `userId`
3. **Middleware** — `server/_core/logging-middleware.ts` — wraps procedures with start/end logs, duration, error capture
4. **Admin router** — `server/routers/logging.ts` — admin-only read/filter/export endpoints

## Log entry shape

```typescript
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;                  // ISO 8601
  correlationId?: string;             // per-request UUID
  userId?: string;
  action?: string;
  duration?: number;                  // ms
  success?: boolean;
  errorMessage?: string;
  errorStack?: string;
  [key: string]: unknown;
}
```

## Usage in a procedure

```ts
import { logProcedureAction, logProcedureError } from '../_core/logging-middleware';

createPerson: protectedProcedure
  .input(PersonCreateSchema)
  .mutation(async ({ ctx, input }) => {
    try {
      logProcedureAction(ctx, 'Creating new person', { personId: input.id });
      const result = await createPerson(input);
      ctx.logger.info('Person created', {
        correlationId: ctx.correlationId,
        personId: result.id,
        duration: Date.now() - start,
      });
      return result;
    } catch (error) {
      logProcedureError(ctx, 'Failed to create person', error as Error);
      throw error;
    }
  });
```

## Admin endpoints (all admin-only)

| Endpoint | Purpose |
|---|---|
| `logging.getLogs` | paginated logs `{ limit, offset }` |
| `logging.getLogsByCorrelationId` | trace one request `{ correlationId }` |
| `logging.getLogsByLevel` | filter `{ level, limit }` |
| `logging.getErrorLogs` | recent errors `{ limit }` |
| `logging.getStats` | aggregate counts (level, unique correlationIds, unique users, oldest/newest) |
| `logging.exportLogs` | JSON export `{ level, limit }` |
| `logging.clearLogs` | reset (caution) |

UI: `/admin/logs` page with filters, pagination, CSV export.

## Best practices (kept brief)

- **Always include `correlationId`** in every log payload — it's how a request is traced end-to-end.
- **Structured fields, not strings** — write `{ personId, duration }` not `\`Person ${id} in ${ms}ms\``. Queryable.
- **Levels**: `debug` dev-only · `info` normal flow · `warn` recoverable surprise · `error` failure.
- **Never log PII** — names, emails, passwords, document numbers. IDs only. (Reinforced by PR #28 audit-no-pii regression test.)
- **Async log for batch loops** to avoid blocking — `await logger.infoAsync(…)` if it exists, otherwise inline `logger.info` is already non-blocking after the first call.

## Performance characteristics

| Operation | Time |
|---|---|
| Log single entry | < 1 ms |
| Filter by correlationId | < 50 ms (O(n) scan over 1000-entry buffer) |
| Middleware overhead | < 5 ms per call |
| Memory (1000 logs) | ~500 KB |

## Limitations + future enhancements

- In-memory only — restart loses logs. Acceptable per design (admin can export).
- No log aggregation (ELK / Datadog) — out of scope for Gate 1.
- No real-time streaming — admin polls.
- No retention policy in code (Phase 4 added pg_cron retention for the *audit_log* and *webhook_log* DB tables, separate from this in-process logger).

## Why this is archived

This file was implementation documentation written when the logging system shipped. The above is the durable subset. For day-to-day development, read the source files at the paths listed at the top.
