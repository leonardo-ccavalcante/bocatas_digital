import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import type { DuplicateCandidate } from "../schemas";

interface DuplicateWarningCardProps {
  candidates: DuplicateCandidate[];
  onContinueAnyway: () => void;
}

function getInitials(nombre: string, apellidos: string | null): string {
  const parts = [nombre, apellidos ?? ""].join(" ").trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function DuplicateWarningCard({ candidates, onContinueAnyway }: DuplicateWarningCardProps) {
  if (candidates.length === 0) return null;

  return (
    <Card className="border-yellow-300 bg-yellow-50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4" />
          Posibles duplicados encontrados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-yellow-700">
          Existen personas con nombre similar. Verifica si ya están registradas antes de crear un registro nuevo.
        </p>
        <ul className="space-y-2">
          {candidates.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-md bg-white p-2 shadow-sm">
              <Avatar className="h-8 w-8 shrink-0">
                {c.foto_perfil_url && <AvatarImage src={c.foto_perfil_url} alt={c.nombre} />}
                <AvatarFallback className="text-xs">
                  {getInitials(c.nombre, c.apellidos)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {c.nombre} {c.apellidos}
                </p>
                {c.fecha_nacimiento && (
                  <p className="text-xs text-muted-foreground">
                    Nacido/a: {c.fecha_nacimiento}
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                {Math.round(c.similarity * 100)}%
              </span>
              <Link href={`/personas/${c.id}`}>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Ver ficha">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          variant="outline"
          className="w-full border-yellow-400 text-yellow-800 hover:bg-yellow-100"
          onClick={onContinueAnyway}
        >
          Continuar con el registro nuevo
        </Button>
      </CardContent>
    </Card>
  );
}
