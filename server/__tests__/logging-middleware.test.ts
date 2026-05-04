import { describe, it, expect, beforeEach } from 'vitest';
import { Logger } from '../_core/logger';
import { createLoggingMiddleware, logProcedureAction, logProcedureError } from '../_core/logging-middleware';
import type { TrpcContext } from '../_core/context';

describe('Logging Middleware - tRPC Integration', () => {
  let mockContext: TrpcContext;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
    mockContext = {
      req: {} as any,
      res: {} as any,
      user: { id: 'user-123' } as any,
      logger,
      correlationId: 'test-corr-123',
    };
  });

  describe('createLoggingMiddleware', () => {
    it('logs procedure start and completion', async () => {
      const middleware = createLoggingMiddleware({ logInputs: true, logOutputs: true });

      const next = async () => 'success result';

      const result = await middleware({
        ctx: mockContext,
        type: 'query',
        path: 'users.getById',
        input: { id: 'user-1' },
        next,
      });

      expect(result).toBe('success result');

      const logs = logger.getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(logs[0].message).toContain('started');
      expect(logs[1].message).toContain('completed');
    });

    it('includes correlation ID in all logs', async () => {
      const middleware = createLoggingMiddleware();

      await middleware({
        ctx: mockContext,
        type: 'mutation',
        path: 'persons.create',
        input: { name: 'Test' },
        next: async () => ({ id: 'new-id' }),
      });

      const logs = logger.getLogs();
      logs.forEach(log => {
        expect(log.correlationId).toBe('test-corr-123');
      });
    });

    it('includes user ID in logs', async () => {
      const middleware = createLoggingMiddleware();

      await middleware({
        ctx: mockContext,
        type: 'query',
        path: 'dashboard.getStats',
        input: undefined,
        next: async () => ({ count: 42 }),
      });

      const logs = logger.getLogs();
      logs.forEach(log => {
        expect(log.userId).toBe('user-123');
      });
    });

    it('tracks procedure duration', async () => {
      const middleware = createLoggingMiddleware();

      await middleware({
        ctx: mockContext,
        type: 'query',
        path: 'test.slow',
        input: undefined,
        next: async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'done';
        },
      });

      const logs = logger.getLogs();
      const completionLog = logs.find(l => l.message.includes('completed'));
      expect(completionLog?.duration).toBeGreaterThanOrEqual(40);
    });

    it('logs errors with full context', async () => {
      const middleware = createLoggingMiddleware({ logErrors: true });
      const testError = new Error('Operation failed');

      try {
        await middleware({
          ctx: mockContext,
          type: 'mutation',
          path: 'persons.create',
          input: { name: 'Test' },
          next: async () => {
            throw testError;
          },
        });
      } catch (e) {
        // Expected to throw
      }

      const logs = logger.getLogs();
      const errorLog = logs.find(l => l.level === 'error');
      expect(errorLog).toBeDefined();
      expect(errorLog?.message).toContain('failed');
      expect(errorLog?.errorMessage).toBe('Operation failed');
      expect(errorLog?.success).toBe(false);
    });

    it('respects logInputs option', async () => {
      const middleware = createLoggingMiddleware({ logInputs: false, logOutputs: true });

      await middleware({
        ctx: mockContext,
        type: 'query',
        path: 'test.query',
        input: { secret: 'data' },
        next: async () => 'result',
      });

      const logs = logger.getLogs();
      const startLog = logs.find(l => l.message.includes('started'));
      expect(startLog?.input).toBeUndefined();
    });

    it('respects logOutputs option', async () => {
      const middleware = createLoggingMiddleware({ logInputs: true, logOutputs: false });

      await middleware({
        ctx: mockContext,
        type: 'query',
        path: 'test.query',
        input: { id: '1' },
        next: async () => 'result',
      });

      const logs = logger.getLogs();
      const completionLog = logs.find(l => l.message.includes('completed'));
      expect(completionLog).toBeUndefined();
    });

    it('respects logErrors option', async () => {
      const middleware = createLoggingMiddleware({ logErrors: false });

      try {
        await middleware({
          ctx: mockContext,
          type: 'mutation',
          path: 'test.fail',
          input: undefined,
          next: async () => {
            throw new Error('Test error');
          },
        });
      } catch (e) {
        // Expected
      }

      const logs = logger.getLogs();
      const errorLog = logs.find(l => l.level === 'error');
      expect(errorLog).toBeUndefined();
    });

    it('includes procedure type and path in logs', async () => {
      const middleware = createLoggingMiddleware();

      await middleware({
        ctx: mockContext,
        type: 'mutation',
        path: 'families.createBulk',
        input: { count: 10 },
        next: async () => ({ created: 10 }),
      });

      const logs = logger.getLogs();
      logs.forEach(log => {
        expect(log.type).toBe('mutation');
        expect(log.path).toBe('families.createBulk');
      });
    });
  });

  describe('logProcedureAction', () => {
    it('logs custom action with context', () => {
      logProcedureAction(mockContext, 'Person created successfully', {
        personId: 'p-123',
        programId: 'prog-456',
      });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: 'info',
        message: 'Person created successfully',
        correlationId: 'test-corr-123',
        userId: 'user-123',
        personId: 'p-123',
        programId: 'prog-456',
      });
    });
  });

  describe('logProcedureError', () => {
    it('logs error with context', () => {
      const error = new Error('Database connection failed');
      logProcedureError(mockContext, 'Failed to save person', error, {
        personId: 'p-123',
        retryCount: 3,
      });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: 'error',
        message: 'Failed to save person',
        correlationId: 'test-corr-123',
        userId: 'user-123',
        errorMessage: 'Database connection failed',
        retryCount: 3,
      });
      expect(logs[0].errorStack).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('middleware adds minimal overhead', async () => {
      const middleware = createLoggingMiddleware();
      const iterations = 100;

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await middleware({
          ctx: mockContext,
          type: 'query',
          path: 'test.query',
          input: undefined,
          next: async () => ({ result: i }),
        });
      }

      const duration = Date.now() - startTime;
      // 100 middleware calls should complete in < 2000ms (allowing for test environment variance)
      expect(duration).toBeLessThan(2000)
    });
  });
});
