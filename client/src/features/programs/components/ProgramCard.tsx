import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ProgramWithCounts } from "../schemas";

interface ProgramCardProps {
  program: ProgramWithCounts;
  isAdmin?: boolean;
}

export function ProgramCard({ program, isAdmin }: ProgramCardProps) {
  return (
    <Link href={`/programas/${program.slug}`}>
      <Card className="group cursor-pointer border border-border/60 hover:border-primary/40 hover:shadow-md transition-all duration-200 h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-2xl" role="img" aria-label={program.name}>
                {program.icon ?? "🏠"}
              </span>
              <div>
                <h3 className="font-semibold text-sm leading-tight text-foreground group-hover:text-primary transition-colors">
                  {program.name}
                </h3>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{program.slug}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {!program.is_active && (
                <Badge variant="secondary" className="text-xs">Inactivo</Badge>
              )}
              {program.is_default && (
                <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                  Por defecto
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        {isAdmin && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-2 border-t border-border/40 pt-3">
              <div className="text-center">
                <p className="text-lg font-bold text-foreground tabular-nums">
                  {program.active_enrollments}
                </p>
                <p className="text-xs text-muted-foreground">Activos</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground tabular-nums">
                  {program.total_enrollments}
                </p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-600 tabular-nums">
                  +{program.new_this_month}
                </p>
                <p className="text-xs text-muted-foreground">Este mes</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}
