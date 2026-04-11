import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, AlertCircle } from "lucide-react";
import { QRCodeCard } from "@/features/persons/components/QRCodeCard";
import { usePersonById } from "@/features/persons/hooks/usePersonById";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

export default function PersonaQR() {
  const { id } = useParams<{ id: string }>();
  const { data: person, isLoading, isError } = usePersonById(id ?? "");

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href={`/personas/${id ?? ""}`}>
            <Button variant="ghost" size="sm" aria-label="Volver a la ficha">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-sm font-semibold">Código QR</h1>
        </div>
      </div>

      <div className="p-4">
        {isLoading && (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">No se pudo cargar los datos de la persona.</p>
          </div>
        )}

        {person && <QRCodeCard person={person as PersonRow} />}
      </div>
    </div>
  );
}
