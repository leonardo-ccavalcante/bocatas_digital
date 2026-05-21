/**
 * FamiliasVerificar — E-E4 (Job 7)
 * Volunteer-facing page to verify a family's identity at delivery time.
 * Search by family number or titular name, then show IdentityVerifier.
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ShieldCheck, Users } from "lucide-react";
import BackLink from "@/components/layout/BackLink";
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
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      {/* Header */}
      <div>
        <BackLink label="Familias" href="/familias" className="mb-3" />
        <h1 className="text-display-2 flex items-center gap-2 text-foreground">
          <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          Verificar identidad
        </h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
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
            <button
              key={family.id}
              type="button"
              className="bocatas-card flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
              onClick={() => setSelectedFamilyId(family.id)}
            >
              <Users className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-medium text-foreground truncate">
                  {family.persons?.nombre} {family.persons?.apellidos}
                </p>
                <p className="text-xs text-muted-foreground">
                  Familia #{family.familia_numero} · {family.num_miembros} miembro(s)
                </p>
              </div>
              <Badge
                variant={family.estado === "activa" ? "default" : "secondary"}
                className="shrink-0 text-xs"
              >
                {family.estado}
              </Badge>
            </button>
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
            <div
              role="status"
              className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4"
            >
              <ShieldCheck className="h-6 w-6 shrink-0 text-green-600" aria-hidden="true" />
              <div>
                <p className="font-semibold text-green-800">Identidad verificada</p>
                <p className="text-body-sm text-green-700">Puede proceder con la entrega.</p>
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
