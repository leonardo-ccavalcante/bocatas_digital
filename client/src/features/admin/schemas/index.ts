/**
 * admin/schemas/index.ts — Zod schemas for staff user management (D-C12).
 * Used by InviteStaffModal and createStaffUser mutation.
 */
import { z } from "zod";

/** Roles available when INVITING a staff user (server: admin.createStaffUser). */
export const StaffRoleSchema = z.enum(["admin", "voluntario"]);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

/**
 * Roles assignable to an EXISTING staff user (server: admin.setUserRole).
 *
 * Wider than StaffRoleSchema because superadmin can only be granted here — the
 * invite flow deliberately cannot create one. Before #144 this had no client
 * caller at all, so the only way to move someone between roles was the Supabase
 * dashboard, and superadmin could not be granted from the app at all.
 *
 * `beneficiario` is intentionally absent: removing staff status is what
 * "Revocar" is for, and offering two ways to do it invites mistakes.
 */
export const AssignableRoleSchema = z.enum(["voluntario", "admin", "superadmin"]);
export type AssignableRole = z.infer<typeof AssignableRoleSchema>;

/** Schema for inviting a new staff user (Job 6, AC3) */
export const CreateStaffUserSchema = z.object({
  email: z
    .string()
    .min(1, "El email es obligatorio")
    .email("Introduce un email válido"),
  nombre: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no puede superar los 100 caracteres"),
  role: StaffRoleSchema,
});
export type CreateStaffUserValues = z.infer<typeof CreateStaffUserSchema>;

/** Schema representing a staff user returned from the server */
export const StaffUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  nombre: z.string(),
  role: z.string(), // "admin" | "voluntario" | "superadmin"
  created_at: z.string(),
  last_sign_in_at: z.string().nullable(),
});
export type StaffUser = z.infer<typeof StaffUserSchema>;

/** Role display labels */
export const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  voluntario: "Voluntario",
  user: "Usuario",
  beneficiario: "Beneficiario",
};

/** Role badge colors */
export const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-purple-100 text-purple-800 border-purple-200",
  admin: "bg-blue-100 text-blue-800 border-blue-200",
  voluntario: "bg-green-100 text-green-800 border-green-200",
  user: "bg-gray-100 text-gray-600 border-gray-200",
  beneficiario: "bg-gray-100 text-gray-600 border-gray-200",
};
