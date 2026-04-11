import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit2, Loader2, BookOpen } from "lucide-react";
import { usePrograms } from "@/features/persons/hooks/usePrograms";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface ProgramForm {
  name: string;
  description: string;
  icon: string;
  is_active: boolean;
}

const DEFAULT_FORM: ProgramForm = { name: "", description: "", icon: "📋", is_active: true };

export default function AdminProgramas() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { data: programs = [], isLoading } = usePrograms();

  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProgramForm>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const openCreate = () => {
    setEditId(null);
    setForm(DEFAULT_FORM);
    setShowDialog(true);
  };

  const openEdit = (prog: { id: string; name: string; description?: string | null; icon: string; is_active: boolean }) => {
    setEditId(prog.id);
    setForm({
      name: prog.name,
      description: prog.description ?? "",
      icon: prog.icon,
      is_active: prog.is_active,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre del programa es obligatorio");
      return;
    }
    setIsSaving(true);
    try {
      if (editId) {
        const { error } = await supabase
          .from("programs")
          .update({ name: form.name, description: form.description || null, icon: form.icon, is_active: form.is_active })
          .eq("id", editId);
        if (error) throw error;
        toast.success("Programa actualizado");
      } else {
        // Generate slug from name
        const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const { error } = await supabase
          .from("programs")
          .insert({ slug, name: form.name, description: form.description || null, icon: form.icon, is_active: form.is_active, is_default: false, display_order: 99 });
        if (error) throw error;
        toast.success("Programa creado");
      }
      void queryClient.invalidateQueries({ queryKey: ["programs"] });
      setShowDialog(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error al guardar: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Programas</h1>
          <p className="text-sm text-muted-foreground">Gestiona los programas disponibles para inscripción.</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Nuevo programa
        </Button>
      </div>

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && programs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <BookOpen className="h-10 w-10" />
            <p className="text-sm">No hay programas creados todavía.</p>
            <Button size="sm" onClick={openCreate}>Crear primer programa</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {programs.map((prog) => (
          <Card key={prog.id} className={!prog.is_active ? "opacity-60" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="text-xl">{prog.icon}</span>
                {prog.name}
                {!prog.is_active && <Badge variant="secondary" className="text-xs">Inactivo</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{prog.description ?? "Sin descripción"}</p>
              <Button size="sm" variant="outline" onClick={() => openEdit(prog)}>
                <Edit2 className="mr-1 h-3.5 w-3.5" /> Editar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={showDialog} onOpenChange={(v) => { if (!v) setShowDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar programa" : "Nuevo programa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="prog-name">Nombre <span className="text-destructive">*</span></Label>
              <Input
                id="prog-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Comedor social, Banco de alimentos..."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prog-desc">Descripción</Label>
              <Textarea
                id="prog-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Breve descripción del programa..."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prog-icon">Icono (emoji)</Label>
              <Input
                id="prog-icon"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="🍽️"
                className="w-24"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="prog-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
              <Label htmlFor="prog-active" className="cursor-pointer">Activo</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Guardando...</> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
