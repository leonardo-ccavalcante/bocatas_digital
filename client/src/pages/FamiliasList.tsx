import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Plus, Search, ChevronRight, Download, Upload, FileText } from "lucide-react";
import { useFamiliasList } from "@/features/families/hooks/useFamilias";
import { ExportFamiliesModal } from "@/components/ExportFamiliesModal";
import { ImportFamiliesModal } from "@/components/ImportFamiliesModal";
import { DeliveryDocumentUpload } from "@/components/DeliveryDocumentUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function FamiliasList() {
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<"activa" | "baja" | "all">("activa");
  const [sinGuf, setSinGuf] = useState(false);
  const [sinInforme, setSinInforme] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deliveryUploadOpen, setDeliveryUploadOpen] = useState(false);

  const { data: families, isLoading } = useFamiliasList({
    search: search || undefined,
    estado,
    sin_alta_guf: sinGuf || undefined,
    sin_informe_social: sinInforme || undefined,
  });

  return (
    <div className="container py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Programa de Familias</h1>
              <p className="text-sm text-muted-foreground">
                {families?.length ?? 0} familias registradas
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDeliveryUploadOpen(true)}>
              <FileText className="mr-2 h-4 w-4" /> Subir Entregas
            </Button>
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="mr-2 h-4 w-4" /> Exportar CSV
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Importar CSV
            </Button>
            <Link href="/familias/nueva">
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Nueva familia
              </Button>
            </Link>
          </div>
        </div>

        {/* CSV Modals */}
        <ExportFamiliesModal open={exportOpen} onOpenChange={setExportOpen} />
        <ImportFamiliesModal open={importOpen} onOpenChange={setImportOpen} />

        {/* Delivery Upload Modal */}
        <Dialog open={deliveryUploadOpen} onOpenChange={setDeliveryUploadOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Subir Documento de Entregas</DialogTitle>
            </DialogHeader>
            <DeliveryDocumentUpload
              onSuccess={() => {
                setDeliveryUploadOpen(false);
              }}
              onError={(message) => {
                console.error("Error uploading delivery document:", message);
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre o número..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={estado} onValueChange={(v) => setEstado(v as typeof estado)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="activa">Activas</SelectItem>
              <SelectItem value="baja">De baja</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={sinGuf ? "default" : "outline"}
            size="sm"
            onClick={() => setSinGuf(!sinGuf)}
          >
            Sin GUF
          </Button>
          <Button
            variant={sinInforme ? "default" : "outline"}
            size="sm"
            onClick={() => setSinInforme(!sinInforme)}
          >
            Sin informe social
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : families && families.length > 0 ? (
          <div className="space-y-2">
            {families.map((f) => {
              const person = f.persons as { id: string; nombre: string; apellidos: string | null } | null;
              const numMiembros = (f.num_adultos ?? 0) + (f.num_menores_18 ?? 0);
              return (
              <Link key={f.id} href={`/familias/${f.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between flex-wrap gap-2 py-3 px-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">
                          #{f.familia_numero}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">
                          {person ? `${person.nombre} ${person.apellidos ?? ""}` : "Sin nombre"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {numMiembros} miembro{numMiembros !== 1 ? "s" : ""}
                          {f.alta_en_guf ? " · GUF" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={f.estado === "activa" ? "default" : "secondary"}>
                        {f.estado}
                      </Badge>
                      {!f.alta_en_guf && (
                        <Badge variant="outline" className="text-yellow-600 border-yellow-400 text-xs">
                          Sin GUF
                        </Badge>
                      )}
                      {!f.informe_social && (
                        <Badge variant="outline" className="text-red-600 border-red-400 text-xs">
                          Sin informe
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No se encontraron familias</p>
            <Link href="/familias/nueva">
              <Button variant="outline" className="mt-4">
                <Plus className="mr-2 h-4 w-4" /> Registrar primera familia
              </Button>
            </Link>
          </div>
        )}
    </div>
  );
}

FamiliasList.displayName = "FamiliasList";