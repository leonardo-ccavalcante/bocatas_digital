import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { InstitucionEditDialog } from "./_InstitucionEditDialog";
import { InstitucionRowComponent } from "./_InstitucionRow";
import type { InstitucionRow } from "./_InstitucionTypes";
import type { InstitucionCreate } from "../../../../../shared/derivar/types";

export function InstitucionesPage() {
  const { user } = useAuth();

  const isAdmin =
    user?.role === "admin" || user?.role === "superadmin";
  const isSuperadmin = user?.role === "superadmin";

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // ── Dialog state ─────────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogInitial, setDialogInitial] = useState<InstitucionRow | null>(null);

  // ── tRPC ─────────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();

  const listQuery = trpc.instituciones.list.useQuery(
    {
      search: search.trim() || undefined,
      is_active: showInactive ? undefined : true,
    },
    { enabled: isAdmin },
  );

  const createMutation = trpc.instituciones.create.useMutation();
  const updateMutation = trpc.instituciones.update.useMutation();
  const deactivateMutation = trpc.instituciones.deactivate.useMutation();

  // ── Guard: non-admin ──────────────────────────────────────────────────────────
  if (user && !isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-destructive" role="alert">
          No tienes permisos para acceder a esta sección.
        </p>
        <Link href="/programas">
          <Button variant="outline" className="mt-4">
            Ir a programas
          </Button>
        </Link>
      </div>
    );
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function openCreate() {
    setDialogMode("create");
    setDialogInitial(null);
    setDialogOpen(true);
  }

  function openEdit(inst: InstitucionRow) {
    setDialogMode("edit");
    setDialogInitial(inst);
    setDialogOpen(true);
  }

  async function handleSave(values: InstitucionCreate, id?: string) {
    try {
      if (dialogMode === "create") {
        await createMutation.mutateAsync(values);
        toast.success("Institución creada correctamente");
      } else if (id) {
        await updateMutation.mutateAsync({ id, data: values });
        toast.success("Institución actualizada correctamente");
      }
      await utils.instituciones.list.invalidate();
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    }
  }

  async function handleDeactivate(inst: InstitucionRow) {
    if (!isSuperadmin) return;
    try {
      await deactivateMutation.mutateAsync({ id: inst.id });
      toast.success(`${inst.nombre} desactivada`);
      await utils.instituciones.list.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar");
    }
  }

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deactivateMutation.isPending;

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Instituciones</h1>
        <Button onClick={openCreate} aria-label="Nueva institución">
          + Nueva institución
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <Input
          className="max-w-xs"
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar institución"
        />
        <div className="flex items-center gap-2">
          <Switch
            id="show-inactive"
            checked={showInactive}
            onCheckedChange={setShowInactive}
            aria-label="Mostrar inactivas"
          />
          <Label htmlFor="show-inactive" className="cursor-pointer">
            Mostrar inactivas
          </Label>
        </div>
        {total > 0 && (
          <span className="text-sm text-muted-foreground">
            {total} resultado{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      {listQuery.isLoading ? (
        <div className="space-y-2" aria-live="polite" aria-label="Cargando instituciones">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : listQuery.error ? (
        <p className="text-destructive" role="alert">
          Error al cargar instituciones.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No hay instituciones{search ? " que coincidan con la búsqueda" : ""}.
        </p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Distrito</TableHead>
                <TableHead>Áreas</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((inst) => (
                <InstitucionRowComponent
                  key={inst.id}
                  inst={inst as InstitucionRow}
                  isSuperadmin={isSuperadmin}
                  onEdit={openEdit}
                  onDeactivate={handleDeactivate}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit dialog — only rendered when open so useForm always mounts fresh.
           Keyed by initial.id so edit instances are isolated from each other. */}
      {dialogOpen && (
        <InstitucionEditDialog
          key={dialogInitial?.id ?? "new"}
          open={dialogOpen}
          mode={dialogMode}
          initial={dialogInitial}
          isPending={isPending}
          onClose={() => setDialogOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
