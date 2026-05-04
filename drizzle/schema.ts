import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "superadmin", "voluntario", "beneficiario"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Families table - core family records
 */
export const families = mysqlTable("families", {
  id: varchar("id", { length: 36 }).primaryKey(), // UUID
  familia_numero: varchar("familia_numero", { length: 100 }).notNull().unique(),
  nombre_responsable: varchar("nombre_responsable", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  telefono: varchar("telefono", { length: 20 }),
  estado: mysqlEnum("estado", ["activa", "inactiva", "suspendida"]).default("activa").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Family = typeof families.$inferSelect;
export type InsertFamily = typeof families.$inferInsert;

// entregas and entregas_batch tables removed — all delivery data now lives in the
// canonical `deliveries` table in Supabase. Batch metadata is stored in the
// JSONB `metadata` column; session_id groups rows from the same batch.