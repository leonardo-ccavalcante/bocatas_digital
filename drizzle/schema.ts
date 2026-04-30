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

/**
 * Delivery batch table - document header metadata
 * Captures document-level information from physical delivery forms
 */
export const entregas_batch = mysqlTable("entregas_batch", {
  id: varchar("id", { length: 36 }).primaryKey(), // UUID
  numero_albaran: varchar("numero_albaran", { length: 100 }).notNull().unique(),
  numero_reparto: varchar("numero_reparto", { length: 100 }).notNull(),
  numero_factura_carne: varchar("numero_factura_carne", { length: 100 }),
  total_personas_asistidas: int("total_personas_asistidas").notNull(),
  fecha_reparto: varchar("fecha_reparto", { length: 10 }).notNull(), // YYYY-MM-DD
  documento_imagen_url: text("documento_imagen_url"),
  ocr_confidence: int("ocr_confidence"), // 0-100
  estado: mysqlEnum("estado", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EntregasBatch = typeof entregas_batch.$inferSelect;
export type InsertEntregasBatch = typeof entregas_batch.$inferInsert;

/**
 * Individual delivery records table
 * Captures each family's delivery from a batch document
 */
export const entregas = mysqlTable("entregas", {
  id: varchar("id", { length: 36 }).primaryKey(), // UUID
  entregas_batch_id: varchar("entregas_batch_id", { length: 36 }).notNull(),
  familia_id: varchar("familia_id", { length: 36 }).notNull(),
  fecha: varchar("fecha", { length: 10 }).notNull(), // YYYY-MM-DD
  persona_recibio: varchar("persona_recibio", { length: 255 }),
  frutas_hortalizas_cantidad: int("frutas_hortalizas_cantidad"),
  frutas_hortalizas_unidad: varchar("frutas_hortalizas_unidad", { length: 50 }),
  carne_cantidad: int("carne_cantidad"),
  carne_unidad: varchar("carne_unidad", { length: 50 }),
  notas: text("notas"),
  ocr_row_confidence: int("ocr_row_confidence"), // 0-100
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Entrega = typeof entregas.$inferSelect;
export type InsertEntrega = typeof entregas.$inferInsert;