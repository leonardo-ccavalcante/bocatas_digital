/**
 * PersonActionsMenu — el menú `⋯` de una persona en el listado.
 *
 * Antes de esto el listado tenía dos afordancias rotas en el móvil, que es el
 * dispositivo de los voluntarios:
 *
 *  · en escritorio las acciones de la fila eran `opacity-0 group-hover:opacity-100`
 *    — invisibles sin ratón, o sea nunca visibles en un teléfono;
 *  · en el móvil el `⋯` de la tarjeta era un `<span aria-hidden>` decorativo que
 *    NO hacía nada. Un `⋯` que no abre nada enseña a no tocar nada.
 *
 * Un solo menú resuelve el acceso a las tres cosas (ficha, edición, QR) sin
 * meter tres iconos en una columna de 80px ni rehacer la tarjeta móvil.
 *
 * El rol se lee aquí con useAuth en vez de bajarlo por props a través de
 * Personas → Personas.lists → fila/tarjeta: `auth.me` es una sola query
 * cacheada, así que N filas comparten una petición y el diff no atraviesa
 * cuatro archivos.
 *
 * Primer consumidor de components/ui/dropdown-menu en la app. Si Radix diera
 * problemas en Android, el plan B es Sheet (ya probado en FamiliaDrawer,
 * DistritoPanel y HojaDrawer).
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { MoreHorizontal, Eye, FileText, Pencil, QrCode } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { PersonDocumentsModal } from "./documents";

interface PersonActionsMenuProps {
  personId: string;
  nombreCompleto: string;
  /** `icon` = fila de escritorio (compacta) · `card` = tarjeta móvil (pulgar). */
  variant: "icon" | "card";
}

export function PersonActionsMenu({
  personId,
  nombreCompleto,
  variant,
}: PersonActionsMenuProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const isSuperadmin = user?.role === "superadmin";
  const [documentosAbierto, setDocumentosAbierto] = useState(false);

  // Una sola consulta compartida por todas las filas (misma clave de caché), y
  // sólo para superadmin. Se descartó añadir un `tiene_documento` a getAll:
  // metería la columna de la RUTA en una consulta de cientos de filas.
  const idsConDocumentos = trpc.persons.getPersonIdsWithDocuments.useQuery(undefined, {
    enabled: isSuperadmin,
    staleTime: 60_000,
    retry: false,
  });
  // Fail-open: mientras carga, o si falla, el ítem aparece igual. La pared es
  // el servidor (superadminProcedure), no esta lista de conveniencia.
  const puedeTenerDocumentos =
    isSuperadmin &&
    (!idsConDocumentos.isSuccess || idsConDocumentos.data.personIds.includes(personId));

  const irA = (destino: string) => navigate(destino);

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Acciones de ${nombreCompleto}`}
        // La fila/tarjeta entera navega al tocarla: sin esto, abrir el menú
        // también dispararía esa navegación.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className={
          // h-9 (36px) en la tarjeta: exactamente la huella del `<span>` que
          // sustituye. ROW_HEIGHT_MOBILE (Personas.tsx) es una estimación FIJA
          // del virtualizador — crecer el disparador a 44px empujaría la tarjeta
          // por encima de esa altura y las filas se solaparían. 36px ya supera
          // de sobra el mínimo AA de 24px (WCAG 2.5.8); donde el pulgar necesita
          // holgura de verdad es en los ítems del menú, y esos sí son h-11.
          variant === "card"
            ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            : "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        }
      >
        <MoreHorizontal className={variant === "card" ? "h-4 w-4" : "h-3.5 w-3.5"} />
      </DropdownMenuTrigger>

      {/* h-11 por ítem: el pulgar de un voluntario en un Android de gama baja,
          no el cursor de nadie. */}
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem className="h-11" onSelect={() => irA(`/personas/${personId}`)}>
          <Eye aria-hidden="true" /> Ver ficha
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem
            className="h-11"
            // `?editar=1` abre el modal al aterrizar: un ítem que dice "Editar
            // ficha" y sólo te deja delante del botón sería mentira a medias.
            onSelect={() => irA(`/personas/${personId}?editar=1`)}
          >
            <Pencil aria-hidden="true" /> Editar ficha
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="h-11" onSelect={() => irA(`/personas/${personId}/qr`)}>
          <QrCode aria-hidden="true" /> Ver QR
        </DropdownMenuItem>
        {puedeTenerDocumentos && (
          <DropdownMenuItem className="h-11" onSelect={() => setDocumentosAbierto(true)}>
            <FileText aria-hidden="true" /> Documentos
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>

    {/* Fuera del menú: al elegir el ítem, el menú se desmonta. */}
    {isSuperadmin && (
      <PersonDocumentsModal
        personId={personId}
        nombreCompleto={nombreCompleto}
        open={documentosAbierto}
        onOpenChange={setDocumentosAbierto}
      />
    )}
    </>
  );
}
