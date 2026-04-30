import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, entregas_batch, entregas, Entrega, EntregasBatch } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Entregas (delivery) query helpers

/**
 * Get all delivery records for a specific family
 */
export async function getEntregasByFamilia(familiaId: string): Promise<Entrega[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get entregas: database not available");
    return [];
  }

  try {
    return await db
      .select()
      .from(entregas)
      .where(eq(entregas.familia_id, familiaId))
      .orderBy(entregas.fecha);
  } catch (error) {
    console.error("[Database] Failed to get entregas by familia:", error);
    throw error;
  }
}

/**
 * Get a specific delivery batch with all its delivery records
 */
export async function getEntregaBatchDetails(batchId: string): Promise<{
  batch: EntregasBatch | null;
  entregas: Entrega[];
}> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get entrega batch: database not available");
    return { batch: null, entregas: [] };
  }

  try {
    const batchResult = await db
      .select()
      .from(entregas_batch)
      .where(eq(entregas_batch.id, batchId))
      .limit(1);

    const batch = batchResult.length > 0 ? batchResult[0] : null;

    const entregasResult = await db
      .select()
      .from(entregas)
      .where(eq(entregas.entregas_batch_id, batchId));

    return { batch, entregas: entregasResult };
  } catch (error) {
    console.error("[Database] Failed to get entrega batch details:", error);
    throw error;
  }
}

/**
 * Create a new delivery batch
 */
export async function createEntregaBatch(batch: typeof entregas_batch.$inferInsert): Promise<EntregasBatch | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create entrega batch: database not available");
    return null;
  }

  try {
    await db.insert(entregas_batch).values(batch);
    // Fetch and return the created batch
    const result = await db
      .select()
      .from(entregas_batch)
      .where(eq(entregas_batch.id, batch.id))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to create entrega batch:", error);
    throw error;
  }
}

/**
 * Create multiple delivery records
 */
export async function createEntregas(records: (typeof entregas.$inferInsert)[]): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create entregas: database not available");
    return;
  }

  try {
    await db.insert(entregas).values(records);
  } catch (error) {
    console.error("[Database] Failed to create entregas:", error);
    throw error;
  }
}

/**
 * Update a delivery record
 */
export async function updateEntrega(id: string, data: Partial<typeof entregas.$inferInsert>): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update entrega: database not available");
    return;
  }

  try {
    await db.update(entregas).set(data).where(eq(entregas.id, id));
  } catch (error) {
    console.error("[Database] Failed to update entrega:", error);
    throw error;
  }
}

/**
 * Delete a delivery record
 */
export async function deleteEntrega(id: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete entrega: database not available");
    return;
  }

  try {
    await db.delete(entregas).where(eq(entregas.id, id));
  } catch (error) {
    console.error("[Database] Failed to delete entrega:", error);
    throw error;
  }
}

// TODO: add more feature queries here as your schema grows.
