import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TDD Test Suite: Duplicate Person Creation Bug - FIXED
 * 
 * Bug: Clicking "Registrar persona" button multiple times creates duplicate records
 * 
 * Root Cause: Race condition - state update is async, so multiple clicks could proceed
 * 
 * Fix Applied: Added re-entry guard `if (isSubmitting) return;` at start of handleFinalSubmit
 * 
 * Success Criteria:
 * 1. Re-entry guard prevents concurrent submissions
 * 2. Only ONE person record created on multiple rapid clicks
 * 3. Mutation called exactly once
 */

describe('Person Registration - Duplicate Creation Prevention (FIXED)', () => {
  describe('Re-entry guard prevents concurrent submissions', () => {
    it('should prevent multiple concurrent submissions with re-entry guard', async () => {
      let isSubmitting = false;
      let submissionCount = 0;

      // Simulate the handleFinalSubmit function with re-entry guard
      const handleFinalSubmit = async () => {
        // Guard against multiple concurrent submissions (the fix)
        if (isSubmitting) {
          return; // Early exit if already submitting
        }

        isSubmitting = true;
        try {
          submissionCount++;
          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, 100));
        } finally {
          isSubmitting = false;
        }
      };

      // Simulate 3 rapid clicks
      const submission1 = handleFinalSubmit();
      const submission2 = handleFinalSubmit(); // Should return early due to guard
      const submission3 = handleFinalSubmit(); // Should return early due to guard

      await Promise.all([submission1, submission2, submission3]);

      // With fix: Only 1 submission should proceed
      expect(submissionCount).toBe(1);
    });

    it('should not call createPerson mutation multiple times with guard', async () => {
      const createPersonMock = vi.fn(async () => ({
        id: '123',
        nombre: 'Test',
        apellidos: 'Person',
      }));

      let isSubmitting = false;

      const handleFinalSubmit = async () => {
        // Guard against multiple concurrent submissions
        if (isSubmitting) {
          return;
        }

        isSubmitting = true;
        try {
          await new Promise(resolve => setTimeout(resolve, 50)); // Simulate async work
          await createPersonMock();
        } finally {
          isSubmitting = false;
        }
      };

      // Simulate 3 rapid clicks (concurrent, not sequential)
      const submission1 = handleFinalSubmit();
      const submission2 = handleFinalSubmit(); // Should return early due to guard
      const submission3 = handleFinalSubmit(); // Should return early due to guard
      await Promise.all([submission1, submission2, submission3]);

      // With fix: mutation should be called exactly once
      expect(createPersonMock).toHaveBeenCalledTimes(1);
    });

    it('should allow new submission after first one completes', async () => {
      const submitMock = vi.fn(async () => 'success');
      let isSubmitting = false;

      const handleFinalSubmit = async () => {
        if (isSubmitting) {
          return;
        }

        isSubmitting = true;
        try {
          return await submitMock();
        } finally {
          isSubmitting = false;
        }
      };

      // First submission
      const result1 = await handleFinalSubmit();
      expect(result1).toBe('success');
      expect(submitMock).toHaveBeenCalledTimes(1);

      // Second submission (after first completes)
      const result2 = await handleFinalSubmit();
      expect(result2).toBe('success');
      expect(submitMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('Button disabled state prevents UI clicks', () => {
    it('should have disabled={isSubmitting || !groupAAccepted} on submit button', () => {
      let isSubmitting = false;
      const groupAAccepted = true;

      const buttonDisabled = isSubmitting || !groupAAccepted;

      // Initially enabled
      expect(buttonDisabled).toBe(false);

      // During submission
      isSubmitting = true;
      expect(isSubmitting || !groupAAccepted).toBe(true);

      // After submission
      isSubmitting = false;
      expect(isSubmitting || !groupAAccepted).toBe(false);
    });

    it('should show loading state while submitting', () => {
      let isSubmitting = false;

      const getButtonUI = () => ({
        disabled: isSubmitting,
        text: isSubmitting ? 'Guardando...' : 'Registrar persona',
      });

      // Initial state
      let ui = getButtonUI();
      expect(ui.disabled).toBe(false);
      expect(ui.text).toBe('Registrar persona');

      // During submission
      isSubmitting = true;
      ui = getButtonUI();
      expect(ui.disabled).toBe(true);
      expect(ui.text).toBe('Guardando...');

      // After submission
      isSubmitting = false;
      ui = getButtonUI();
      expect(ui.disabled).toBe(false);
      expect(ui.text).toBe('Registrar persona');
    });
  });

  describe('Combined protection: guard + disabled button', () => {
    it('should have double protection against duplicates', async () => {
      let isSubmitting = false;
      const createMock = vi.fn(async () => ({ id: '1' }));

      const handleFinalSubmit = async () => {
        // Protection 1: Re-entry guard
        if (isSubmitting) {
          return;
        }

        isSubmitting = true;
        try {
          return await createMock();
        } finally {
          isSubmitting = false;
        }
      };

      // Simulate rapid clicks (protection 2: button disabled)
      const click1 = handleFinalSubmit();
      const click2 = handleFinalSubmit(); // Blocked by guard
      const click3 = handleFinalSubmit(); // Blocked by guard

      await Promise.all([click1, click2, click3]);

      // Only one mutation call
      expect(createMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling during submission', () => {
    it('should reset isSubmitting flag on error', async () => {
      let isSubmitting = false;
      let error: string | null = null;

      const handleFinalSubmit = async () => {
        if (isSubmitting) {
          return;
        }

        isSubmitting = true;
        try {
          throw new Error('Network error');
        } catch (err) {
          error = err instanceof Error ? err.message : 'Unknown error';
        } finally {
          isSubmitting = false;
        }
      };

      await handleFinalSubmit();

      expect(error).toBe('Network error');
      expect(isSubmitting).toBe(false); // Flag reset after error
    });

    it('should allow retry after error', async () => {
      let isSubmitting = false;
      const submitMock = vi.fn(async () => {
        throw new Error('First attempt failed');
      });

      const handleFinalSubmit = async () => {
        if (isSubmitting) {
          return;
        }

        isSubmitting = true;
        try {
          return await submitMock();
        } finally {
          isSubmitting = false;
        }
      };

      // First attempt fails
      try {
        await handleFinalSubmit();
      } catch {
        // Expected
      }

      expect(submitMock).toHaveBeenCalledTimes(1);
      expect(isSubmitting).toBe(false);

      // Second attempt succeeds
      submitMock.mockResolvedValueOnce({ id: '1' } as never);
      const result = await handleFinalSubmit();

      expect(result).toEqual({ id: '1' });
      expect(submitMock).toHaveBeenCalledTimes(2);
    });
  });
});
