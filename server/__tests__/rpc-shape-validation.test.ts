import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * I4: Untyped RPC Results
 * get_programs_with_counts RPC should have validated shape
 * to prevent silent crashes when DB returns unexpected data.
 */

// Expected shape from get_programs_with_counts RPC
const ProgramWithCountsSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  icon: z.string().nullable(),
  is_default: z.boolean(),
  is_active: z.boolean(),
  display_order: z.number(),
  volunteer_can_access: z.boolean(),
  active_enrollments: z.number(),
  total_enrollments: z.number(),
});

const ProgramsWithCountsArraySchema = z.array(ProgramWithCountsSchema);

describe('I4: RPC shape validation for get_programs_with_counts', () => {
  it('should validate correct RPC response shape', () => {
    const validData = [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Comedor Social',
        slug: 'comedor_social',
        icon: '🍽️',
        is_default: true,
        is_active: true,
        display_order: 1,
        volunteer_can_access: true,
        active_enrollments: 42,
        total_enrollments: 100,
      },
    ];

    const result = ProgramsWithCountsArraySchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject RPC response missing required fields', () => {
    const invalidData = [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Comedor Social',
        // missing slug, active_enrollments, etc.
      },
    ];

    const result = ProgramsWithCountsArraySchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should handle empty array from RPC', () => {
    const result = ProgramsWithCountsArraySchema.safeParse([]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  it('should coerce null counts to 0', () => {
    // Some DB implementations may return null for count aggregates
    const dataWithNullCounts = [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Comedor Social',
        slug: 'comedor_social',
        icon: null,
        is_default: false,
        is_active: true,
        display_order: 1,
        volunteer_can_access: false,
        active_enrollments: null,
        total_enrollments: null,
      },
    ];

    // With coercion schema
    const CoercedSchema = z.array(ProgramWithCountsSchema.extend({
      active_enrollments: z.number().nullable().transform(v => v ?? 0),
      total_enrollments: z.number().nullable().transform(v => v ?? 0),
    }));

    const result = CoercedSchema.safeParse(dataWithNullCounts);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].active_enrollments).toBe(0);
      expect(result.data[0].total_enrollments).toBe(0);
    }
  });
});
