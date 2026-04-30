import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";

export interface AudienceRule {
  programs: string[];
  roles: string[];
}

export interface Program {
  id: string;
  nombre: string;
}

interface AudiencesSelectorProps {
  programs: Program[];
  roles: string[];
  value: AudienceRule[];
  onChange: (value: AudienceRule[]) => void;
}

export function AudiencesSelector({
  programs,
  roles,
  value,
  onChange,
}: AudiencesSelectorProps) {
  const [expanded, setExpanded] = useState(true);
  const currentRule = value[0] || { programs: [], roles: [] };

  const handleProgramToggle = (programId: string) => {
    const newPrograms = currentRule.programs.includes(programId)
      ? currentRule.programs.filter((id) => id !== programId)
      : [...currentRule.programs, programId];

    onChange([{ ...currentRule, programs: newPrograms }]);
  };

  const handleRoleToggle = (role: string) => {
    const newRoles = currentRule.roles.includes(role)
      ? currentRule.roles.filter((r) => r !== role)
      : [...currentRule.roles, role];

    onChange([{ ...currentRule, roles: newRoles }]);
  };

  const selectedCount =
    currentRule.programs.length + currentRule.roles.length;

  return (
    <Card className="p-4 bg-slate-50 border-slate-200">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left font-medium mb-3 flex items-center justify-between hover:bg-slate-100 p-2 rounded transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">
            Audiencias (quién ve esta novedad)
          </span>
          {selectedCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full">
              {selectedCount}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-500 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="space-y-4 mt-3">
          {programs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2 tracking-wide">
                Programas
              </h4>
              <div className="space-y-2 pl-1">
                {programs.map((prog) => (
                  <label
                    key={prog.id}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <Checkbox
                      checked={currentRule.programs.includes(prog.id)}
                      onCheckedChange={() => handleProgramToggle(prog.id)}
                      className="group-hover:border-blue-500"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900">
                      {prog.nombre}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {roles.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2 tracking-wide">
                Roles
              </h4>
              <div className="space-y-2 pl-1">
                {roles.map((role) => (
                  <label
                    key={role}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <Checkbox
                      checked={currentRule.roles.includes(role)}
                      onCheckedChange={() => handleRoleToggle(role)}
                      className="group-hover:border-blue-500"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 capitalize">
                      {role === "beneficiario"
                        ? "Beneficiario"
                        : role === "voluntario"
                          ? "Voluntario"
                          : "Admin"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-200">
            <p className="text-xs text-gray-500 italic">
              💡 Si no seleccionas nada, la novedad será visible para
              <strong> todos</strong>.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
