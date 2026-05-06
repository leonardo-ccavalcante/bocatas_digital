import {
  type AnnouncementRole,
  type AnnouncementProgram,
  type AudienceRule,
} from "../../../shared/announcementTypes";

export interface VisibilityInput {
  userRole: AnnouncementRole;
  userPrograms: readonly AnnouncementProgram[];
  audiences: readonly AudienceRule[];
  fechaInicio: Date | null;
  fechaFin: Date | null;
  activo: boolean;
  now?: Date;
}

export function isVisibleToUser(input: VisibilityInput): boolean {
  const now = input.now ?? new Date();

  if (!input.activo) return false;
  if (input.fechaInicio !== null && now < input.fechaInicio) return false;
  if (input.fechaFin !== null && now >= input.fechaFin) return false;
  if (input.audiences.length === 0) return false;

  return input.audiences.some((rule) => {
    const roleMatch =
      rule.roles.length === 0 ||
      (rule.roles as readonly string[]).includes(input.userRole);
    const programMatch =
      rule.programs.length === 0 ||
      input.userPrograms.some((p) =>
        (rule.programs as readonly string[]).includes(p)
      );
    return roleMatch && programMatch;
  });
}
