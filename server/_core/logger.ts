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
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...metadata,
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
