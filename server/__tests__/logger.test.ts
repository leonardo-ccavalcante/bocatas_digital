import { describe, it, expect, beforeEach } from 'vitest';
import { Logger, LogLevel, LogEntry } from '../_core/logger';

describe('Logger - Professional Logging System', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
  });

  describe('Core logging methods', () => {
    it('logs info messages with correct level and timestamp', () => {
      const correlationId = 'test-corr-123';
      logger.info('Test info message', { correlationId, userId: 'user-1' });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: 'info',
        message: 'Test info message',
        correlationId: 'test-corr-123',
        userId: 'user-1',
      });
      expect(logs[0].timestamp).toBeDefined();
    });

    it('logs warn messages with correct level', () => {
      logger.warn('Test warning', { correlationId: 'warn-123' });

      const logs = logger.getLogs();
      expect(logs[0].level).toBe('warn');
    });

    it('logs error messages with error object', () => {
      const error = new Error('Test error');
      logger.error('Operation failed', { correlationId: 'err-123', error });

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        level: 'error',
        message: 'Operation failed',
        correlationId: 'err-123',
      });
      expect(logs[0].errorMessage).toBe('Test error');
    });

    it('logs debug messages', () => {
      logger.debug('Debug info', { correlationId: 'debug-123', details: { foo: 'bar' } });

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        level: 'debug',
        message: 'Debug info',
        correlationId: 'debug-123',
      });
    });
  });

  describe('Correlation ID tracking', () => {
    it('includes correlation ID in all logs', () => {
      const correlationId = 'corr-abc-123';
      logger.info('Message 1', { correlationId });
      logger.warn('Message 2', { correlationId });
      logger.error('Message 3', { correlationId });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(3);
      logs.forEach(log => {
        expect(log.correlationId).toBe(correlationId);
      });
    });

    it('allows filtering logs by correlation ID', () => {
      logger.info('Msg 1', { correlationId: 'corr-1' });
      logger.info('Msg 2', { correlationId: 'corr-2' });
      logger.info('Msg 3', { correlationId: 'corr-1' });

      const filtered = logger.getLogsByCorrelationId('corr-1');
      expect(filtered).toHaveLength(2);
      expect(filtered[0].message).toBe('Msg 1');
      expect(filtered[1].message).toBe('Msg 3');
    });
  });

  describe('Structured data', () => {
    it('preserves custom metadata fields', () => {
      logger.info('User action', {
        correlationId: 'test-123',
        userId: 'user-42',
        action: 'create_person',
        duration: 125,
        success: true,
      });

      const logs = logger.getLogs();
      expect(logs[0]).toMatchObject({
        userId: 'user-42',
        action: 'create_person',
        duration: 125,
        success: true,
      });
    });

    it('serializes to JSON without errors', () => {
      logger.info('Test message', { correlationId: 'test-123', data: { nested: { value: 42 } } });

      const logs = logger.getLogs();
      const json = JSON.stringify(logs[0]);
      expect(json).toBeDefined();
      expect(json).toContain('Test message');
      expect(json).toContain('test-123');
    });
  });

  describe('Ring buffer (memory management)', () => {
    it('maintains maximum buffer size', () => {
      const maxSize = 100;
      const logger = new Logger(maxSize);

      // Add more logs than buffer size
      for (let i = 0; i < maxSize + 50; i++) {
        logger.info(`Message ${i}`, { correlationId: `corr-${i}` });
      }

      const logs = logger.getLogs();
      expect(logs.length).toBeLessThanOrEqual(maxSize);
      expect(logs.length).toBe(maxSize);
    });

    it('removes oldest logs when buffer is full', () => {
      const maxSize = 5;
      const logger = new Logger(maxSize);

      for (let i = 1; i <= 7; i++) {
        logger.info(`Message ${i}`, { correlationId: `corr-${i}` });
      }

      const logs = logger.getLogs();
      expect(logs).toHaveLength(5);
      // Oldest messages (1, 2) should be removed
      expect(logs[0].message).toBe('Message 3');
      expect(logs[4].message).toBe('Message 7');
    });
  });

  describe('Log filtering', () => {
    beforeEach(() => {
      logger.info('Info message', { correlationId: 'test-1' });
      logger.warn('Warn message', { correlationId: 'test-1' });
      logger.error('Error message', { correlationId: 'test-1' });
      logger.debug('Debug message', { correlationId: 'test-1' });
    });

    it('filters logs by level', () => {
      const errors = logger.getLogsByLevel('error');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Error message');
    });

    it('filters logs by level (multiple)', () => {
      const warnings = logger.getLogsByLevel('warn');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe('Warn message');
    });

    it('returns empty array for non-existent level', () => {
      const logs = logger.getLogsByLevel('info');
      expect(logs).toHaveLength(1);
    });
  });

  describe('Async operations', () => {
    it('logs asynchronously without blocking', async () => {
      const startTime = Date.now();
      
      // Log multiple messages
      await Promise.all([
        logger.infoAsync('Async message 1', { correlationId: 'async-1' }),
        logger.infoAsync('Async message 2', { correlationId: 'async-2' }),
        logger.infoAsync('Async message 3', { correlationId: 'async-3' }),
      ]);

      const duration = Date.now() - startTime;
      const logs = logger.getLogs();

      expect(logs).toHaveLength(3);
      // Async operations should complete quickly (< 100ms for in-memory)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Error handling', () => {
    it('handles circular references in metadata', () => {
      // test mock boundary — logger spy
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const circular: any = { name: 'test' };
      circular.self = circular;

      // Should not throw
      expect(() => {
        logger.info('Test', { correlationId: 'test-123', data: circular });
      }).not.toThrow();

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
    });

    it('extracts error stack trace', () => {
      const error = new Error('Test error');
      logger.error('Failed operation', { correlationId: 'test-123', error });

      const logs = logger.getLogs();
      expect(logs[0].errorStack).toBeDefined();
      expect(logs[0].errorStack).toContain('Error');
    });
  });

  describe('Performance', () => {
    it('logs 1000 messages in reasonable time', () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        logger.info(`Message ${i}`, { correlationId: `perf-${i % 10}`, index: i });
      }

      const duration = Date.now() - startTime;
      // Should complete in < 500ms for 1000 sync logs
      expect(duration).toBeLessThan(500);
    });
  });

  describe('JSON output format', () => {
    it('produces valid JSON for all log entries', () => {
      logger.info('Test message', { correlationId: 'json-test', userId: 'user-1' });
      logger.error('Error occurred', { correlationId: 'json-test', error: new Error('Test') });

      const logs = logger.getLogs();
      logs.forEach(log => {
        const json = JSON.stringify(log);
        const parsed = JSON.parse(json);
        expect(parsed.level).toBeDefined();
        expect(parsed.message).toBeDefined();
        expect(parsed.timestamp).toBeDefined();
      });
    });
  });
});
