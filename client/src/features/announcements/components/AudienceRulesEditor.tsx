/**
 * AudienceRulesEditor.tsx — Multi-rule audience editor for announcements.
 *
 * Each rule = (roles[], programs[]). Empty arrays mean "any". An announcement
 * is visible to a user when ANY rule matches: their role is in the rule's
 * roles (or roles is empty) AND any of their program enrollments is in the
 * rule's programs (or programs is empty).
 */
import { useMemo, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ANNOUNCEMENT_ROLES,
  ANNOUNCEMENT_PROGRAMS,
  type AnnouncementRole,
  type AnnouncementProgram,
  type AudienceRule,
} from "@shared/announcementTypes";

const ROLE_LABELS: Record<AnnouncementRole, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  voluntario: "Voluntario",
  beneficiario: "Beneficiario",
};

const PROGRAM_LABELS: Record<AnnouncementProgram, string> = {
  comedor: "Comedor",
  familia: "Familias",
  formacion: "Formación",
  atencion_juridica: "Atención Jurídica",
  voluntariado: "Voluntariado",
  acompanamiento: "Acompañamiento",
};

export interface MutableAudienceRule {
  roles: AnnouncementRole[];
  programs: AnnouncementProgram[];
}

interface AudienceRulesEditorProps {
  value: MutableAudienceRule[];
  onChange: (next: MutableAudienceRule[]) => void;
  /** Optional error to display under the editor */
  error?: string;
}

function toggleInArray<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function AudienceRulesEditor({
  value,
  onChange,
  error,
}: AudienceRulesEditorProps) {
  // Stable React keys per rule, indexed positionally. Removing a rule must
  // also remove its key so the remaining rules retain their identity.
  const keyCounter = useRef(0);
  const keysRef = useRef<string[]>([]);
  const keys = useMemo(() => {
    while (keysRef.current.length < value.length) {
      keyCounter.current += 1;
      keysRef.current.push(`rule-${keyCounter.current}`);
    }
    return keysRef.current.slice(0, value.length);
  }, [value.length]);

  function updateRule(index: number, next: MutableAudienceRule) {
    const copy = [...value];
    copy[index] = next;
    onChange(copy);
  }

  function addRule() {
    onChange([...value, { roles: [], programs: [] }]);
  }

  function removeRule(index: number) {
    keysRef.current.splice(index, 1);
    onChange(value.filter((_, i) => i !== index));
  }

  function summarize(rule: MutableAudienceRule): string {
    const roles = rule.roles.length === 0 ? "todos" : rule.roles.join(", ");
    const programs =
      rule.programs.length === 0 ? "todos" : rule.programs.join(", ");
    return `Roles: ${roles}  ·  Programas: ${programs}`;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          Audiencia (¿quién verá esta novedad?)
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRule}
          className="gap-1 h-7 text-xs"
        >
          <Plus className="w-3 h-3" /> Agregar regla
        </Button>
      </div>

      {value.length === 0 && (
        <div className="rounded border border-dashed border-gray-300 p-3 text-xs text-gray-500 text-center">
          Añade al menos una regla. Sin reglas, la novedad no será visible para
          nadie.
        </div>
      )}

      {value.map((rule, idx) => (
        <div
          key={keys[idx]}
          className="rounded-lg border border-gray-200 p-3 space-y-3 bg-gray-50/50"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-semibold text-gray-600">
              Regla {idx + 1}
              <p className="font-normal text-gray-500 mt-0.5">
                {summarize(rule)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeRule(idx)}
              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
              aria-label={`Eliminar regla ${idx + 1}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">
                Roles{" "}
                <span className="text-gray-400 font-normal">
                  (vacío = todos)
                </span>
              </p>
              <div className="space-y-1.5">
                {ANNOUNCEMENT_ROLES.map((r) => (
                  <label
                    key={r}
                    className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer"
                  >
                    <Checkbox
                      checked={rule.roles.includes(r)}
                      onCheckedChange={() =>
                        updateRule(idx, {
                          ...rule,
                          roles: toggleInArray(rule.roles, r),
                        })
                      }
                    />
                    {ROLE_LABELS[r]}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">
                Programas{" "}
                <span className="text-gray-400 font-normal">
                  (vacío = todos)
                </span>
              </p>
              <div className="space-y-1.5">
                {ANNOUNCEMENT_PROGRAMS.map((p) => (
                  <label
                    key={p}
                    className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer"
                  >
                    <Checkbox
                      checked={rule.programs.includes(p)}
                      onCheckedChange={() =>
                        updateRule(idx, {
                          ...rule,
                          programs: toggleInArray(rule.programs, p),
                        })
                      }
                    />
                    {PROGRAM_LABELS[p]}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/** Convert AudienceRule (readonly) → MutableAudienceRule for use in form state. */
export function toMutableRules(
  rules: readonly AudienceRule[]
): MutableAudienceRule[] {
  return rules.map((r) => ({
    roles: [...r.roles],
    programs: [...r.programs],
  }));
}
