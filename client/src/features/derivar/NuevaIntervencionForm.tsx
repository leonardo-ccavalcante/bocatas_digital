/**
 * NuevaIntervencionForm — smart pre-fill form for logging an intervention.
 *
 * Calls derivar.startIntervention to fetch all known header data (nombre,
 * programa, profesional, fecha de apertura) and renders it as read-only badges.
 * The user only fills in the unknown fields: fecha, tipo, descripcion,
 * institución, and observaciones.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { InstitucionTypeahead } from "./InstitucionTypeahead";
import type { InstitucionPickedItem } from "./CrearInstitucionInlineModal";
import {
  useStartIntervention,
  useTipos,
  useAddIntervention,
} from "./hooks/useDerivar";
import type { Scope } from "@shared/derivar/types";

interface NuevaIntervencionFormProps {
  scope: Scope;
  entityId: string;
  programaId: string;
  onSaved: (hojaId: string) => void;
  onCancel: () => void;
}

export function NuevaIntervencionForm({
  scope,
  entityId,
  programaId,
  onSaved,
  onCancel,
}: NuevaIntervencionFormProps) {
  const start = useStartIntervention(scope, entityId, programaId, true);
  const tipos = useTipos();
  const add = useAddIntervention();

  const [fecha, setFecha] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [tipoSlug, setTipoSlug] = useState<string>("");
  const [descripcion, setDescripcion] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [institucion, setInstitucion] = useState<InstitucionPickedItem | null>(
    null,
  );

  if (start.isLoading || (!start.data && !start.isError)) {
    return (
      <div className="space-y-2 p-4" aria-busy="true" aria-label="Cargando datos">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (start.isError || !start.data) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-sm text-destructive" role="alert">
          {start.error instanceof Error
            ? start.error.message
            : "No se han podido cargar los datos. Inténtalo de nuevo."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} type="button">
            Cerrar
          </Button>
          <Button
            type="button"
            onClick={() => void start.refetch()}
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const { header } = start.data;

  const onSubmit = async () => {
    if (!tipoSlug) {
      toast.error("Selecciona un tipo de intervención");
      return;
    }
    if (!descripcion.trim()) {
      toast.error("Descripción obligatoria");
      return;
    }
    try {
      const r = await add.mutateAsync({
        scope,
        entityId,
        programaId,
        fecha,
        tipoSlug,
        descripcion: descripcion.trim(),
        institucionId: institucion?.id,
        institucionSnapshot: institucion
          ? {
              nombre: institucion.nombre,
              direccion: institucion.direccion,
              telefono: institucion.telefono,
              email: institucion.email,
              codigo_postal: institucion.codigo_postal,
            }
          : undefined,
        observaciones: observaciones.trim() || undefined,
      });
      toast.success("Intervención registrada");
      onSaved(r.hojaId);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error al guardar la intervención",
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Pre-filled header (read-only) */}
      <Card aria-label="Datos del expediente (pre-rellenados)">
        <CardContent className="p-3 space-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">Nombre: </span>
            <strong>{header.nombre}</strong>
          </div>
          {header.numUnidadFamiliar && (
            <div>
              <span className="text-muted-foreground">
                Nº Unidad familiar:{" "}
              </span>
              <strong>{header.numUnidadFamiliar}</strong>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Programa: </span>
            <strong>{header.programaNombre}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Profesional: </span>
            <strong>{header.profesionalNombre}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Fecha de apertura: </span>
            <strong>
              {new Date(header.fechaAperturaISO).toLocaleDateString("es-ES")}
            </strong>
          </div>
        </CardContent>
      </Card>

      {/* User inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="intervencion-fecha">Fecha *</Label>
          <Input
            id="intervencion-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            aria-required="true"
          />
        </div>
        <div>
          <Label htmlFor="intervencion-tipo">Tipo de intervención *</Label>
          <Select value={tipoSlug} onValueChange={setTipoSlug}>
            <SelectTrigger
              id="intervencion-tipo"
              aria-label="Tipo de intervención"
              aria-required="true"
            >
              <SelectValue placeholder="Selecciona..." />
            </SelectTrigger>
            <SelectContent>
              {tipos.data.map((t) => (
                <SelectItem key={t.slug} value={t.slug}>
                  {t.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="intervencion-descripcion">
          Descripción de la actuación *
        </Label>
        <Textarea
          id="intervencion-descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          aria-required="true"
        />
      </div>

      <div>
        <Label htmlFor="intervencion-institucion">
          Recurso al que se deriva
        </Label>
        <InstitucionTypeahead
          id="intervencion-institucion"
          value={institucion}
          onChange={setInstitucion}
        />
      </div>

      <div>
        <Label htmlFor="intervencion-observaciones">Observaciones</Label>
        <Textarea
          id="intervencion-observaciones"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} type="button">
          Cancelar
        </Button>
        <Button
          onClick={onSubmit}
          disabled={add.isPending}
          type="button"
          aria-busy={add.isPending}
        >
          {add.isPending ? "Guardando..." : "Guardar intervención"}
        </Button>
      </div>
    </div>
  );
}
