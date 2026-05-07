import { useState } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const SlugRegex = /^[a-z0-9_]+$/;

type DocType = {
  id: string;
  programa_id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  scope: "familia" | "miembro";
  is_required: boolean;
  is_active: boolean;
  display_order: number;
  template_url: string | null;
  template_filename: string | null;
  template_version: string | null;
  guide_url: string | null;
  guide_filename: string | null;
  guide_version: string | null;
  created_at: string;
  updated_at: string;
};

type EditState = {
  id: string;
  nombre: string;
  descripcion: string;
  isRequired: boolean;
  displayOrder: number;
};

type UploadState = {
  docTypeId: string;
  docTypeName: string;
  programSlug: string;
  typeSlug: string;
  kind: "template" | "guide";
};

function ScopeLabel({ scope }: { scope: string }) {
  return scope === "familia" ? (
    <span>Por familia</span>
  ) : (
    <span>Por miembro</span>
  );
}

function TypeRow({
  tipo,
  onToggleActive,
  onEdit,
  onUpload,
}: {
  tipo: DocType;
  onToggleActive: (id: string, newValue: boolean) => void;
  onEdit: (tipo: DocType) => void;
  onUpload: (tipo: DocType, kind: "template" | "guide") => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 py-3 border-b last:border-0 ${!tipo.is_active ? "opacity-60" : ""}`}
      data-inactive={!tipo.is_active ? "true" : undefined}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{tipo.nombre}</p>
        <p className="text-xs text-muted-foreground font-mono">{tipo.slug}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">
            <ScopeLabel scope={tipo.scope} />
          </span>
          {tipo.is_required && (
            <Badge variant="secondary" className="text-xs">Obligatorio</Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Switch
          checked={tipo.is_active}
          onCheckedChange={(val) => onToggleActive(tipo.id, val)}
          aria-label={`Activar/desactivar ${tipo.nombre}`}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(tipo)}
          aria-label={`Editar ${tipo.nombre}`}
        >
          Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onUpload(tipo, "template")}
          aria-label={`Subir plantilla de ${tipo.nombre}`}
        >
          Plantilla
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onUpload(tipo, "guide")}
          aria-label={`Subir guía de ${tipo.nombre}`}
        >
          Guía
        </Button>
      </div>
    </div>
  );
}

function EditDialog({
  state,
  open,
  onClose,
  onSave,
}: {
  state: EditState;
  open: boolean;
  onClose: () => void;
  onSave: (values: EditState) => void;
}) {
  // Keyed by state.id from parent so form initialises fresh on each open
  const [form, setForm] = useState<EditState>(state);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar tipo de documento</DialogTitle>
          <DialogDescription>
            Modifica los campos editables. El slug y el ámbito no son editables.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="edit-nombre">Nombre</Label>
            <Input
              id="edit-nombre"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="edit-descripcion">Descripción</Label>
            <Input
              id="edit-descripcion"
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="edit-required"
              checked={form.isRequired}
              onCheckedChange={(val) => setForm((f) => ({ ...f, isRequired: val }))}
            />
            <Label htmlFor="edit-required">Obligatorio</Label>
          </div>
          <div>
            <Label htmlFor="edit-order">Orden de visualización</Label>
            <Input
              id="edit-order"
              type="number"
              value={form.displayOrder}
              onChange={(e) => setForm((f) => ({ ...f, displayOrder: Number(e.target.value) }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} aria-label="Cancelar">
            Cancelar
          </Button>
          <Button onClick={() => onSave(form)} aria-label="Guardar">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  state,
  open,
  onClose,
  onSave,
}: {
  state: UploadState;
  open: boolean;
  onClose: () => void;
  onSave: (file: File, version: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setFile(null);
      setVersion("");
      onClose();
    }
  };

  const handleSave = async () => {
    if (!file || !version) return;
    setIsSaving(true);
    try {
      await onSave(file, version);
    } finally {
      setIsSaving(false);
    }
  };

  const isDisabled = !file || !version.trim() || isSaving;
  const kindLabel = state.kind === "template" ? "plantilla" : "guía";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir {kindLabel}</DialogTitle>
          <DialogDescription>
            Sube un archivo de {kindLabel} para el tipo "{state.docTypeName}".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="upload-file">Archivo</Label>
            <input
              id="upload-file"
              data-testid="upload-file-input"
              type="file"
              className="block w-full text-sm mt-1"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <Label htmlFor="upload-version">Versión</Label>
            <Input
              id="upload-version"
              placeholder="versión (p.ej. v1)"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} aria-label="Cancelar">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isDisabled} aria-label="Guardar">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProgramaTiposDocumentoPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: program, isLoading: programLoading, error: programError } =
    trpc.programs.getBySlug.useQuery({ slug: slug ?? "" }, { enabled: !!slug });

  const { data: tipos, isLoading: tiposLoading } =
    trpc.programDocumentTypes.list.useQuery(
      { programaId: program?.id ?? "", includeInactive: true },
      { enabled: !!program?.id },
    );

  const utils = trpc.useUtils();

  const updateMutation = trpc.programDocumentTypes.update.useMutation();
  const createMutation = trpc.programDocumentTypes.create.useMutation();
  const registerUploadMutation = trpc.programDocumentTypes.registerUpload.useMutation();

  // ── Add-type form state
  const [newSlug, setNewSlug] = useState("");
  const [newNombre, setNewNombre] = useState("");
  const [newScope, setNewScope] = useState<"familia" | "miembro">("familia");
  const [newRequired, setNewRequired] = useState(false);
  const [newOrder, setNewOrder] = useState(0);

  // ── Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editState, setEditState] = useState<EditState>({
    id: "",
    nombre: "",
    descripcion: "",
    isRequired: false,
    displayOrder: 0,
  });

  // ── Upload dialog state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({
    docTypeId: "",
    docTypeName: "",
    programSlug: "",
    typeSlug: "",
    kind: "template",
  });

  // Slug validation
  const slugValid = SlugRegex.test(newSlug);
  const canCreate = newSlug.length > 0 && newNombre.length > 0 && slugValid;

  async function handleToggleActive(id: string, newValue: boolean) {
    try {
      await updateMutation.mutateAsync({ id, isActive: newValue });
      await utils.programDocumentTypes.list.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    }
  }

  function handleOpenEdit(tipo: DocType) {
    setEditState({
      id: tipo.id,
      nombre: tipo.nombre,
      descripcion: tipo.descripcion ?? "",
      isRequired: tipo.is_required,
      displayOrder: tipo.display_order,
    });
    setEditOpen(true);
  }

  async function handleSaveEdit(values: EditState) {
    try {
      await updateMutation.mutateAsync({
        id: values.id,
        nombre: values.nombre,
        descripcion: values.descripcion || null,
        isRequired: values.isRequired,
        displayOrder: values.displayOrder,
      });
      await utils.programDocumentTypes.list.invalidate();
      setEditOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    }
  }

  function handleOpenUpload(tipo: DocType, kind: "template" | "guide") {
    setUploadState({
      docTypeId: tipo.id,
      docTypeName: tipo.nombre,
      programSlug: program?.slug ?? slug ?? "",
      typeSlug: tipo.slug,
      kind,
    });
    setUploadOpen(true);
  }

  async function handleSaveUpload(file: File, version: string) {
    const supabase = createClient();
    const path = `${uploadState.programSlug}/${uploadState.typeSlug}/${uploadState.kind}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("program-document-templates")
      .upload(path, file, { upsert: false });

    if (uploadError) {
      toast.error(uploadError.message ?? "Error al subir el archivo");
      return;
    }

    try {
      await registerUploadMutation.mutateAsync({
        docTypeId: uploadState.docTypeId,
        kind: uploadState.kind,
        path,
        filename: file.name,
        version,
      });
      await utils.programDocumentTypes.list.invalidate();
      toast.success("Archivo subido correctamente");
      setUploadOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar el archivo");
    }
  }

  async function handleCreate() {
    if (!program || !canCreate) return;
    try {
      await createMutation.mutateAsync({
        programaId: program.id,
        slug: newSlug,
        nombre: newNombre,
        scope: newScope,
        isRequired: newRequired,
        displayOrder: newOrder,
      });
      await utils.programDocumentTypes.list.invalidate();
      setNewSlug("");
      setNewNombre("");
      setNewScope("familia");
      setNewRequired(false);
      setNewOrder(0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear el tipo");
    }
  }

  // ── Render: loading state
  if (programLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ── Render: error state
  if (programError || !program) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <p className="text-destructive">Programa no encontrado</p>
        <Link href={`/programas/${slug}`}>
          <Button variant="outline">Volver</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/programas/${program.slug}`}>
          <Button variant="ghost" size="sm">Volver</Button>
        </Link>
      </div>

      <h1 className="text-2xl font-bold">Tipos de documento — {program.name}</h1>

      {/* Existing types card */}
      <Card>
        <CardHeader>
          <CardTitle>Tipos existentes</CardTitle>
        </CardHeader>
        <CardContent>
          {tiposLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !tipos || tipos.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay tipos configurados.</p>
          ) : (
            <div>
              {tipos.map((tipo) => (
                <TypeRow
                  key={tipo.id}
                  tipo={tipo as DocType}
                  onToggleActive={handleToggleActive}
                  onEdit={handleOpenEdit}
                  onUpload={handleOpenUpload}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add type card */}
      <Card>
        <CardHeader>
          <CardTitle>Añadir tipo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="new-slug">Slug</Label>
                <Input
                  id="new-slug"
                  placeholder="slug (p.ej. padron_municipal)"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                />
                {newSlug && !slugValid && (
                  <p className="text-xs text-destructive mt-1">
                    El slug solo puede contener letras minúsculas, números y guión bajo.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="new-nombre">Nombre</Label>
                <Input
                  id="new-nombre"
                  placeholder="nombre del tipo"
                  value={newNombre}
                  onChange={(e) => setNewNombre(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={newScope === "familia" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNewScope("familia")}
                >
                  Familia
                </Button>
                <Button
                  type="button"
                  variant={newScope === "miembro" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNewScope("miembro")}
                >
                  Miembro
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="new-required"
                  checked={newRequired}
                  onCheckedChange={setNewRequired}
                />
                <Label htmlFor="new-required">Obligatorio</Label>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="new-order">Orden</Label>
                <Input
                  id="new-order"
                  type="number"
                  value={newOrder}
                  onChange={(e) => setNewOrder(Number(e.target.value))}
                  className="w-20"
                />
              </div>
            </div>

            <Button onClick={handleCreate} disabled={!canCreate}>
              Crear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog — key by id so the form resets when a different type is edited */}
      <EditDialog
        key={editState.id}
        state={editState}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={handleSaveEdit}
      />

      {/* Upload dialog */}
      <UploadDialog
        state={uploadState}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSave={handleSaveUpload}
      />
    </div>
  );
}
