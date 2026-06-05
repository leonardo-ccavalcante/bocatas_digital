/**
 * Professional logging system with correlation IDs, structured JSON output,
 * and zero performance impact (async, in-memory ring buffer).
 *
 * Design principles:
 * - Correlation IDs for request tracing
 * - Structured JSON (no string concatenation)
 * - In-memory ring buffer (configurable size, default 1000)
 * - Async operations (non-blocking)
 * - Easy filtering and querying
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  correlationId?: string;
  userId?: string;
  action?: string;
  duration?: number;
  success?: boolean;
  errorMessage?: string;
  errorStack?: string;
  [key: string]: any;
}

export const REDACTED_LOG_VALUE = "[redacted]";

const SENSITIVE_LOG_KEY_NORMALIZED = new Set([
  "nombre",
  "apellidos",
  "telefono",
  "email",
  "direccion",
  "tipodocumento",
  "numerodocumento",
  "paisdocumento",
  "fechanacimiento",
  "fechallegadaespana",
  "situacionlegal",
  "recorridomigratorio",
  "fotodocumentourl",
  "documentofotourl",
  "notasprivadas",
  "observaciones",
  "necesidadesprincipales",
  "restriccionesalimentarias",
  "consenttext",
  "consentimiento",
]);

function normalizeLogKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function isSensitiveLogKey(key: string): boolean {
  const normalized = normalizeLogKey(key);
  return (
    SENSITIVE_LOG_KEY_NORMALIZED.has(normalized) ||
    normalized.endsWith("email") ||
    normalized.endsWith("telefono") ||
    normalized.endsWith("nombre") ||
    normalized.endsWith("apellidos") ||
    normalized.endsWith("numerodocumento") ||
    normalized.endsWith("documentofotourl") ||
    normalized.endsWith("fotodocumentourl")
  );
}

export function redactLogValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Error) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;

  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      isSensitiveLogKey(key) ? REDACTED_LOG_VALUE : redactLogValue(item, seen),
    ])
  );
}

export function sanitizeLogMetadata(
  metadata?: Record<string, any>
): Record<string, any> | undefined {
  if (!metadata) return undefined;
  return redactLogValue(metadata) as Record<string, any>;
}

export class Logger {
  private logs: LogEntry[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Log info level message
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.addLog('info', message, metadata);
  }

  /**
   * Log info level message asynchronously
   */
  async infoAsync(message: string, metadata?: Record<string, any>): Promise<void> {
    return new Promise(resolve => {
      setImmediate(() => {
        this.addLog('info', message, metadata);
        resolve();
      });
    });
  }

  /**
   * Log warn level message
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.addLog('warn', message, metadata);
  }

  /**
   * Log error level message
   */
  error(message: string, metadata?: Record<string, any>): void {
    this.addLog('error', message, metadata);
  }

  /**
   * Log debug level message
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.addLog('debug', message, metadata);
  }

  /**
   * Log audit-level message — for compliance-relevant admin actions.
   * Stored at info level in the ring buffer with audit:true marker.
   * Caller MUST NOT include PII (emails, names, document numbers) in metadata —
   * use stable IDs instead. See CLAUDE.md §Compliance.
   */
  audit(action: string, metadata?: Record<string, any>): void {
    this.addLog('info', action, { ...metadata, audit: true });
  }

  /**
   * Get all logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs by correlation ID
   */
  getLogsByCorrelationId(correlationId: string): LogEntry[] {
    return this.logs.filter(log => log.correlationId === correlationId);
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Internal: add log entry to ring buffer
   */
  private addLog(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    const safeMetadata = sanitizeLogMetadata(metadata);
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...safeMetadata,
    };

    // Extract error details if present
    if (metadata?.error instanceof Error) {
      entry.errorMessage = metadata.error.message;
      entry.errorStack = metadata.error.stack;
      // Remove the error object itself to avoid circular references
      delete entry.error;
    }

    // Add to ring buffer
    this.logs.push(entry);

    // Maintain max size
    if (this.logs.length > this.maxSize) {
      this.logs = this.logs.slice(-this.maxSize);
    }
  }
}

/**
 * Global logger instance
 */
export const globalLogger = new Logger();
