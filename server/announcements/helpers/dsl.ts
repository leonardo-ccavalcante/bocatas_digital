import {
  type AnnouncementRole,
  type AnnouncementProgram,
  type AudienceRule,
  ANNOUNCEMENT_ROLES,
  ANNOUNCEMENT_PROGRAMS,
} from "../../../shared/announcementTypes";

export interface DSLParseResult {
  rules: AudienceRule[];
  errors: { token: string; message: string }[];
}

export function parseAudienciasDSL(
  input: string,
  lineNumber?: number
): DSLParseResult {
  const linePrefix =
    lineNumber !== undefined ? ` (línea ${lineNumber})` : "";

  if (input.trim() === "") {
    return {
      rules: [],
      errors: [
        { token: "", message: `audiencias requerida${linePrefix}` },
      ],
    };
  }

  const rules: AudienceRule[] = [];
  const errors: { token: string; message: string }[] = [];

  const segments = input.split(";").map((s) => s.trim()).filter((s) => s !== "");

  for (const segment of segments) {
    const colonParts = segment.split(":");
    if (colonParts.length !== 2) {
      errors.push({
        token: segment,
        message: `Regla inválida: "${segment}" debe tener exactamente un ":" (roles:programas)${linePrefix}`,
      });
      continue;
    }

    const rawRoles = colonParts[0].trim();
    const rawPrograms = colonParts[1].trim();

    const parsedRoles: AnnouncementRole[] = [];
    let ruleHasError = false;

    if (rawRoles !== "*") {
      const roleTokens = rawRoles.split(",").map((r) => r.trim());
      for (const token of roleTokens) {
        if (token === "") continue;
        if ((ANNOUNCEMENT_ROLES as readonly string[]).includes(token)) {
          parsedRoles.push(token as AnnouncementRole);
        } else {
          errors.push({
            token,
            message: `Rol desconocido: "${token}"${linePrefix}`,
          });
          ruleHasError = true;
        }
      }
    }

    const parsedPrograms: AnnouncementProgram[] = [];

    if (rawPrograms !== "*") {
      const programTokens = rawPrograms.split(",").map((p) => p.trim());
      for (const token of programTokens) {
        if (token === "") continue;
        if ((ANNOUNCEMENT_PROGRAMS as readonly string[]).includes(token)) {
          parsedPrograms.push(token as AnnouncementProgram);
        } else {
          errors.push({
            token,
            message: `Programa desconocido: "${token}"${linePrefix}`,
          });
          ruleHasError = true;
        }
      }
    }

    if (rawRoles === "" && rawPrograms === "") {
      errors.push({
        token: segment,
        message: `Regla vacía: "${segment}"${linePrefix}`,
      });
      continue;
    }

    if (!ruleHasError) {
      rules.push({ roles: parsedRoles, programs: parsedPrograms });
    }
  }

  return { rules, errors };
}
