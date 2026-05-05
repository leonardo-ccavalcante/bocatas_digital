import { type TipoAnnouncement } from "../../../shared/announcementTypes";

export interface AuditChange {
  field: string;
  old_value: unknown;
  new_value: unknown;
}

interface AnnouncementMutableFields {
  titulo: string;
  contenido: string;
  tipo: TipoAnnouncement;
  es_urgente: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fijado: boolean;
  imagen_url: string | null;
}

const MUTABLE_FIELDS: ReadonlyArray<keyof AnnouncementMutableFields> = [
  "titulo",
  "contenido",
  "tipo",
  "es_urgente",
  "fecha_inicio",
  "fecha_fin",
  "fijado",
  "imagen_url",
];

export function diffForAudit(
  prev: AnnouncementMutableFields,
  next: AnnouncementMutableFields
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of MUTABLE_FIELDS) {
    if (prev[field] !== next[field]) {
      changes.push({ field, old_value: prev[field], new_value: next[field] });
    }
  }
  return changes;
}
