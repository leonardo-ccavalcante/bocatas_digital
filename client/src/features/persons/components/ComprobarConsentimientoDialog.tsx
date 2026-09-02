/**
 * ComprobarConsentimientoDialog.tsx — «tengo 7 nombres para un cartel».
 *
 * Se pega la lista (un nombre por línea) y se contesta en cuatro listas:
 * quién tiene el consentimiento de imagen vigente, quién NO, a quién no
 * encontramos y qué nombres están repetidos en la base. Los repetidos no se
 * resuelven aquí a propósito — los mira una persona.
 *
 * Se monta desde la página /informes (client/src/pages/Informes.tsx).
 * Sólo admin/superadmin: `persons.checkConsentByNames` es adminProcedure.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  parsearNombres,
  contarExcluidos,
  MAX_NOMBRES,
} from "../utils/comprobarConsentimiento";

function Lista({
  titulo,
  className,
  items,
}: {
  titulo: string;
  className: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className={`text-xs font-medium ${className}`}>
        {titulo} ({items.length})
      </p>
      <ul className="text-xs text-muted-foreground ml-4 list-disc space-y-0.5">
        {items.map((t, i) => (
          <li key={`${t}-${i}`}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function ComprobarConsentimientoDialog() {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [nombres, setNombres] = useState<string[]>([]);

  const { data, isFetching, isError } = trpc.persons.checkConsentByNames.useQuery(
    { names: nombres, purpose: "fotografia" },
    { enabled: nombres.length > 0 }
  );

  const pendientes = parsearNombres(texto);
  const excluidos = contarExcluidos(texto);
  // Tras editar el texto sin volver a comprobar, las listas de abajo son de la
  // consulta ANTERIOR: se atenúan para que no se lean como vigentes.
  const desfasado =
    data !== undefined && JSON.stringify(pendientes) !== JSON.stringify(nombres);

  function cambiarApertura(next: boolean) {
    if (!next) {
      setTexto("");
      setNombres([]);
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={cambiarApertura}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
          Comprobar consentimiento de imagen
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Comprobar consentimiento de imagen</DialogTitle>
          <DialogDescription>
            Un nombre por línea (máximo {MAX_NOMBRES}). Los nombres que aparecen
            repetidos en la base salen como «ambiguos»: hay que mirarlos a mano,
            no se adivina.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="comprobar-nombres">Nombres</Label>
          <Textarea
            id="comprobar-nombres"
            rows={6}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={"Ana García\nJosé Núñez"}
          />
        </div>

        {excluidos > 0 && (
          <p className="text-xs text-destructive" role="alert">
            {excluidos} nombre{excluidos === 1 ? "" : "s"} supera{excluidos === 1 ? "" : "n"} el
            tope de {MAX_NOMBRES} y NO se comprobará{excluidos === 1 ? "" : "n"} — divide la
            lista en dos.
          </p>
        )}

        <Button
          type="button"
          onClick={() => setNombres(pendientes)}
          disabled={pendientes.length === 0 || isFetching}
        >
          {isFetching ? "Comprobando..." : `Comprobar (${pendientes.length})`}
        </Button>

        {isError && (
          <p className="text-xs text-destructive" role="alert">
            No se pudo comprobar la lista. Vuelve a intentarlo; si sigue fallando,
            avisa al equipo técnico.
          </p>
        )}

        {data && (
          <div
            className={`space-y-3 max-h-72 overflow-y-auto pr-1 ${desfasado ? "opacity-50" : ""}`}
            aria-live="polite"
          >
            <Lista
              titulo="Con consentimiento"
              className="text-emerald-700"
              items={data.con_consentimiento.map((p) => p.nombre)}
            />
            <Lista
              titulo="Sin consentimiento — no publicar"
              className="text-destructive"
              items={data.sin_consentimiento.map((p) => p.nombre)}
            />
            <Lista
              titulo="No encontrados"
              className="text-amber-700"
              items={data.no_encontrados}
            />
            <Lista
              titulo="Ambiguos — revisar a mano"
              className="text-amber-700"
              items={data.ambiguos.map((a) => `${a.input} (${a.matches} coincidencias)`)}
            />
            {desfasado && (
              <p className="text-xs text-amber-700">
                Estos resultados son de la lista anterior — pulsa «Comprobar» de
                nuevo.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
