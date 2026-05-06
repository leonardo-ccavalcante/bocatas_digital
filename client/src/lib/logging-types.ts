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
  [key: string]: unknown;
}
