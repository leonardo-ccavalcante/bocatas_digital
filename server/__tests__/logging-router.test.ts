import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Logger } from '../_core/logger';
import type { TrpcContext } from '../_core/context';
import { globalLogger } from '../_core/logger';

describe('Logging Router - Admin Log Viewer', () => {
  let mockContext: TrpcContext;

  beforeEach(() => {
    globalLogger.clear();
    mockContext = {
      req: {} as any,
      res: {} as any,
      user: { id: 'admin-user', role: 'admin' } as any,
      logger: new Logger(),
      correlationId: 'test-corr-123',
    };
  });

  afterEach(() => {
    globalLogger.clear();
  });

  describe('Log retrieval', () => {
    it('retrieves paginated logs', () => {
      // Populate logs
      for (let i = 1; i <= 150; i++) {
        globalLogger.info(`Log message ${i}`, {
          correlationId: `corr-${i % 10}`,
          index: i,
        });
      }

      const allLogs = globalLogger.getLogs();
      expect(allLogs.length).toBeLessThanOrEqual(1000);

      // Pagination test
      const page1 = allLogs.slice(0, 100);
      const page2 = allLogs.slice(100, 200);

      expect(page1.length).toBe(100);
      expect(page2.length).toBeLessThanOrEqual(50);
    });

    it('filters logs by correlation ID', () => {
      globalLogger.info('Message 1', { correlationId: 'corr-1' });
      globalLogger.info('Message 2', { correlationId: 'corr-2' });
      globalLogger.info('Message 3', { correlationId: 'corr-1' });

      const filtered = globalLogger.getLogsByCorrelationId('corr-1');
      expect(filtered).toHaveLength(2);
      expect(filtered[0].message).toBe('Message 1');
      expect(filtered[1].message).toBe('Message 3');
    });

    it('filters logs by level', () => {
      globalLogger.info('Info message', { correlationId: 'test' });
      globalLogger.warn('Warn message', { correlationId: 'test' });
      globalLogger.error('Error message', { correlationId: 'test' });
      globalLogger.debug('Debug message', { correlationId: 'test' });

      const errorLogs = globalLogger.getLogsByLevel('error');
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].message).toBe('Error message');

      const infoLogs = globalLogger.getLogsByLevel('info');
      expect(infoLogs).toHaveLength(1);
      expect(infoLogs[0].message).toBe('Info message');
    });
  });

  describe('Log statistics', () => {
    it('calculates log statistics', () => {
      globalLogger.info('Info 1', { correlationId: 'corr-1', userId: 'user-1' });
      globalLogger.info('Info 2', { correlationId: 'corr-1', userId: 'user-1' });
      globalLogger.warn('Warn 1', { correlationId: 'corr-2', userId: 'user-2' });
      globalLogger.error('Error 1', { correlationId: 'corr-3', userId: 'user-1' });

      const allLogs = globalLogger.getLogs();
      const stats = {
        total: allLogs.length,
        byLevel: {
          debug: allLogs.filter(l => l.level === 'debug').length,
          info: allLogs.filter(l => l.level === 'info').length,
          warn: allLogs.filter(l => l.level === 'warn').length,
          error: allLogs.filter(l => l.level === 'error').length,
        },
        uniqueCorrelationIds: new Set(
          allLogs.map(l => l.correlationId).filter(Boolean)
        ).size,
        uniqueUsers: new Set(allLogs.map(l => l.userId).filter(Boolean)).size,
      };

      expect(stats.total).toBe(4);
      expect(stats.byLevel.info).toBe(2);
      expect(stats.byLevel.warn).toBe(1);
      expect(stats.byLevel.error).toBe(1);
      expect(stats.uniqueCorrelationIds).toBe(3);
      expect(stats.uniqueUsers).toBe(2);
    });
  });

  describe('Log export', () => {
    it('exports logs as JSON', () => {
      globalLogger.info('Message 1', { correlationId: 'corr-1' });
      globalLogger.warn('Message 2', { correlationId: 'corr-2' });
      globalLogger.error('Message 3', { correlationId: 'corr-3' });

      const allLogs = globalLogger.getLogs();
      const json = JSON.stringify(allLogs);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveLength(3);
      expect(parsed[0].message).toBe('Message 1');
      expect(parsed[2].level).toBe('error');
    });

    it('filters export by level', () => {
      globalLogger.info('Info', { correlationId: 'test' });
      globalLogger.warn('Warn', { correlationId: 'test' });
      globalLogger.error('Error 1', { correlationId: 'test' });
      globalLogger.error('Error 2', { correlationId: 'test' });

      const errorLogs = globalLogger.getLogsByLevel('error');
      expect(errorLogs).toHaveLength(2);

      const json = JSON.stringify(errorLogs);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(2);
      parsed.forEach((log: any) => {
        expect(log.level).toBe('error');
      });
    });
  });

  describe('Log clearing', () => {
    it('clears all logs', () => {
      globalLogger.info('Message 1', { correlationId: 'corr-1' });
      globalLogger.info('Message 2', { correlationId: 'corr-2' });

      let allLogs = globalLogger.getLogs();
      expect(allLogs).toHaveLength(2);

      globalLogger.clear();
      allLogs = globalLogger.getLogs();
      expect(allLogs).toHaveLength(0);
    });
  });

  describe('Request tracing', () => {
    it('traces complete request flow with correlation ID', () => {
      const correlationId = 'req-trace-123';

      globalLogger.info('Request started', { correlationId, path: '/api/persons' });
      globalLogger.info('Database query', { correlationId, query: 'SELECT ...' });
      globalLogger.info('Response sent', { correlationId, status: 200 });

      const trace = globalLogger.getLogsByCorrelationId(correlationId);
      expect(trace).toHaveLength(3);
      expect(trace[0].message).toBe('Request started');
      expect(trace[1].message).toBe('Database query');
      expect(trace[2].message).toBe('Response sent');
    });

    it('supports multiple concurrent requests', () => {
      const req1 = 'req-1';
      const req2 = 'req-2';

      globalLogger.info('Req1 start', { correlationId: req1 });
      globalLogger.info('Req2 start', { correlationId: req2 });
      globalLogger.info('Req1 end', { correlationId: req1 });
      globalLogger.info('Req2 end', { correlationId: req2 });

      const trace1 = globalLogger.getLogsByCorrelationId(req1);
      const trace2 = globalLogger.getLogsByCorrelationId(req2);

      expect(trace1).toHaveLength(2);
      expect(trace2).toHaveLength(2);
      expect(trace1[0].message).toBe('Req1 start');
      expect(trace2[0].message).toBe('Req2 start');
    });
  });

  describe('Performance with large log volumes', () => {
    it('handles 1000+ logs efficiently', () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        globalLogger.info(`Log ${i}`, {
          correlationId: `corr-${i % 100}`,
          userId: `user-${i % 50}`,
          index: i,
        });
      }

      const duration = Date.now() - startTime;
      const allLogs = globalLogger.getLogs();

      expect(allLogs.length).toBeLessThanOrEqual(1000);
      expect(duration).toBeLessThan(500);
    });

    it('filters large log sets efficiently', () => {
      // Populate with many logs
      for (let i = 0; i < 500; i++) {
        globalLogger.info(`Log ${i}`, {
          correlationId: `corr-${i % 50}`,
          userId: `user-${i % 25}`,
        });
      }

      const startTime = Date.now();
      const filtered = globalLogger.getLogsByCorrelationId('corr-1');
      const duration = Date.now() - startTime;

      expect(filtered.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50);
    });
  });
});
