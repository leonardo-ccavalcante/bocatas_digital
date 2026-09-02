/**
 * GrupoNav — «anterior / siguiente» entre fichas del mismo programa.
 *
 * Aparece sólo cuando la ficha se abrió desde el listado de inscritos de un
 * programa (?grupo=<programId>). Recorre la lista COMPLETA de inscripciones
 * del programa (sin filtro de estado — la vista por defecto de la tabla
 * tampoco filtra, y el orden base created_at desc es el mismo aunque el
 * usuario haya filtrado por un chip), capada a GRUPO_NAV_LIMIT
 * (el máximo de programs.getEnrollments). Si el programa tiene más inscritos,
 * la navegación cubre esa primera página: en los bordes el chevrón se pinta
 * desactivado, nunca roto.
 *
 * getEnrollments es admin-only: ante cualquier error (p.ej. FORBIDDEN) el
 * componente no pinta nada — el enlace «volver» del breadcrumb sigue vivo.
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { buildGrupoQuery, computePrevNext } from "@/lib/volverNav";

const GRUPO_NAV_LIMIT = 100;

interface GrupoNavProps {
  grupoId: string;
  personId: string;
  volverHref?: string;
  volverLabel?: string;
}

function Chevron({
  href,
  label,
  children,
}: {
  href?: string;
  label: string;
  children: ReactNode;
}) {
  const base = "inline-flex h-7 w-7 items-center justify-center rounded border border-border";
  if (!href) {
    return (
      <span aria-hidden="true" className={`${base} opacity-40`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={`${base} hover:bg-accent`}>
      {children}
    </Link>
  );
}

export function GrupoNav({ grupoId, personId, volverHref, volverLabel }: GrupoNavProps) {
  const { data, isError } = trpc.programs.getEnrollments.useQuery(
    { programId: grupoId, limit: GRUPO_NAV_LIMIT, offset: 0 },
    { staleTime: 30_000, retry: false }
  );

  if (isError || !data) return null;

  const ids = (data.enrollments as Array<{ persons?: { id?: string } }>)
    .map((e) => e.persons?.id)
    .filter((id): id is string => !!id);
  const { prev, next } = computePrevNext(ids, personId);
  if (!prev && !next) return null;

  const query = buildGrupoQuery(grupoId, volverHref, volverLabel);
  return (
    <nav aria-label="Navegación dentro del grupo" className="ml-auto flex items-center gap-1">
      <Chevron href={prev ? `/personas/${prev}${query}` : undefined} label="Ficha anterior del grupo">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Chevron>
      <Chevron href={next ? `/personas/${next}${query}` : undefined} label="Ficha siguiente del grupo">
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Chevron>
    </nav>
  );
}
