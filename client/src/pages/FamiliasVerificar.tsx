/**
 * FamiliasVerificar — E-E4 (Job 7)
 * Volunteer-facing page to verify a family's identity at delivery time.
 * Search by family number or titular name, then show IdentityVerifier.
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, ShieldCheck, Users } from "lucide-react";
import { IdentityVerifier } from "@/features/families/components/IdentityVerifier";
import { trpc } from "@/lib/trpc";

export default function FamiliasVerificar() {
  const [query, setQuery] = useState("");
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const { data: results, isLoading } = trpc.families.verifyIdentity.useQuery(
    { query },
    { enabled: query.trim().length >= 2 }
  );

  const handleVerified = () => setVerified(true);
  const handleRejected = () => setVerified(false);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Verificar identidad
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Busca la familia por número o nombre del titular para verificar la identidad antes de la entrega.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Nº familia, nombre o apellidos del titular…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedFamilyId(null);
            setVerified(false);
          }}
          className="pl-9"
          autoFocus
        />
      </div>

      {/* Search results */}
      {!selectedFamilyId && query.trim().length >= 2 && (
        <div className="space-y-2">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-4">Buscando…</p>
          )}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {!isLoading && (results as any[])?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No se encontraron familias con esa búsqueda.
            </p>
          )}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {!isLoading && (results as any[])?.map((family: any) => (
            <Card
              key={family.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedFamilyId(family.id)}
            >
              <CardContent className="py-3 flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {family.persons?.nombre} {family.persons?.apellidos}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Familia #{family.familia_numero} · {family.num_miembros} miembro(s)
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs shrink-0 ${
                    family.estado === "activa"
                      ? "border-green-300 text-green-700"
                      : "border-gray-300 text-gray-600"
                  }`}
                >
                  {family.estado}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Identity verifier */}
      {selectedFamilyId && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedFamilyId(null);
                setVerified(false);
              }}
            >
              ← Volver a la búsqueda
            </Button>
          </div>

          {verified && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-green-600 shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Identidad verificada</p>
                <p className="text-sm text-green-700">Puede proceder con la entrega.</p>
              </div>
            </div>
          )}

          <IdentityVerifier
            familyId={selectedFamilyId}
            onVerified={handleVerified}
            onRejected={handleRejected}
          />
        </div>
      )}
    </div>
  );
}
