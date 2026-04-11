import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const BocatasRoleSchema = z.enum(["superadmin", "admin", "voluntario", "beneficiario"]);
export type BocatasRole = z.infer<typeof BocatasRoleSchema>;
