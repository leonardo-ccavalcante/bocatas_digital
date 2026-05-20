/**
 * NotasTab — internal notes about a person.
 *
 * There is NO threaded person-notes endpoint (no author/date entries, no
 * add-note mutation). There ARE two real persons-row fields we surface
 * read-only: `observaciones` (general) and `notas_privadas` (admin-only,
 * high-risk per CLAUDE.md §3). When both are empty we show an honest empty
 * state. We do NOT fabricate a notes thread or render a non-functional save.
 *
 * TODO(frontend-v4): needs threaded person-notes endpoint (author + timestamp
 * + create mutation) to restore the prototype's note composer + history list.
 */
import { StickyNote } from "lucide-react";
import type { Database } from "@/lib/database.types";
import { DetailEmptyState } from "./DetailEmptyState";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

interface NotasTabProps {
  person: PersonRow;
  isAdmin: boolean;
}

function NoteBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <section className="bocatas-card">
      <header className="border-b border-border px-5 py-3">
        <p className="text-eyebrow text-muted-foreground">{label}</p>
      </header>
      <div className="px-5 py-4">
        <p className="whitespace-pre-line text-body-sm leading-snug text-foreground">
          {value}
        </p>
      </div>
    </section>
  );
}

export function NotasTab({ person, isAdmin }: NotasTabProps) {
  const observaciones = person.observaciones?.trim() || null;
  // High-risk field — admin/superadmin only.
  const notasPrivadas = isAdmin ? person.notas_privadas?.trim() || null : null;

  if (!observaciones && !notasPrivadas) {
    return (
      <DetailEmptyState
        icon={StickyNote}
        title="Sin notas"
        description="Todavía no hay notas registradas para esta persona."
      />
    );
  }

  return (
    <div className="space-y-5">
      {observaciones && <NoteBlock label="Observaciones" value={observaciones} />}
      {notasPrivadas && (
        <NoteBlock label="Notas privadas (equipo)" value={notasPrivadas} />
      )}
    </div>
  );
}
