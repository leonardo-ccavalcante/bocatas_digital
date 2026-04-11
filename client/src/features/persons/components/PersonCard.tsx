import { useState } from "react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  User, Phone, Mail, MapPin, FileText, Heart, QrCode,
  Shield, BookOpen, Briefcase, Home, Globe, Calendar, CheckCircle, XCircle,
} from "lucide-react";
import { ConsentModal } from "./ConsentModal";
import { useConsentTemplates } from "../hooks/useConsentTemplates";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

interface PersonCardProps {
  person: PersonRow;
  onRefresh?: () => void;
}

function getInitials(nombre: string, apellidos: string | null): string {
  return [nombre, apellidos ?? ""]
    .join(" ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-1.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

export function PersonCard({ person, onRefresh }: PersonCardProps) {
  const [showConsent, setShowConsent] = useState(false);
  const { data: templates = [] } = useConsentTemplates(
    (person.idioma_principal as "es" | "ar" | "fr" | "bm") ?? "es",
  );

  const fullName = `${person.nombre} ${person.apellidos ?? ""}`.trim();
  const initials = getInitials(person.nombre, person.apellidos);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 shrink-0">
              {person.foto_perfil_url && (
                <AvatarImage src={person.foto_perfil_url} alt={fullName} />
              )}
              <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="truncate text-xl font-bold">{fullName}</h1>
              {person.fecha_nacimiento && (
                <p className="text-sm text-muted-foreground">
                  <Calendar className="mr-1 inline h-3.5 w-3.5" />
                  {new Date(person.fecha_nacimiento).toLocaleDateString("es-ES")}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {person.fase_itinerario && (
                  <Badge variant="secondary" className="capitalize">
                    {person.fase_itinerario}
                  </Badge>
                )}
                {person.idioma_principal && (
                  <Badge variant="outline" className="uppercase">
                    {person.idioma_principal}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Link href={`/personas/${person.id}/qr`}>
                <Button size="sm" variant="outline" aria-label="Ver QR">
                  <QrCode className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowConsent(true)}
                aria-label="Gestionar consentimientos"
              >
                <Shield className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="contacto">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="contacto">Contacto</TabsTrigger>
          <TabsTrigger value="documento">Documento</TabsTrigger>
          <TabsTrigger value="situacion">Situación</TabsTrigger>
          <TabsTrigger value="social">Social</TabsTrigger>
        </TabsList>

        {/* Contacto */}
        <TabsContent value="contacto">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4" /> Información de contacto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              <InfoRow icon={Phone} label="Teléfono" value={person.telefono} />
              <InfoRow icon={Mail} label="Email" value={person.email} />
              <InfoRow icon={MapPin} label="Dirección" value={person.direccion} />
              <InfoRow icon={MapPin} label="Municipio" value={person.municipio} />
              <InfoRow icon={MapPin} label="Barrio / Zona" value={person.barrio_zona} />
              {person.empadronado !== null && (
                <div className="flex items-center gap-3 py-1.5">
                  {person.empadronado ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <p className="text-sm">
                    {person.empadronado ? "Empadronado/a" : "No empadronado/a"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documento */}
        <TabsContent value="documento">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" /> Documento de identidad
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              <InfoRow icon={Globe} label="País de origen" value={person.pais_origen} />
              <InfoRow icon={FileText} label="Tipo de documento" value={person.tipo_documento} />
              <InfoRow icon={FileText} label="Número de documento" value={person.numero_documento} />
              <InfoRow icon={Calendar} label="Fecha de llegada a España" value={person.fecha_llegada_espana} />
              <InfoRow icon={Shield} label="Situación legal" value={person.situacion_legal} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Situación */}
        <TabsContent value="situacion">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Home className="h-4 w-4" /> Situación socioeconómica
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              <InfoRow icon={Home} label="Tipo de vivienda" value={person.tipo_vivienda} />
              <InfoRow icon={BookOpen} label="Nivel de estudios" value={person.nivel_estudios} />
              <InfoRow icon={Briefcase} label="Situación laboral" value={person.situacion_laboral} />
              <InfoRow icon={Briefcase} label="Nivel de ingresos" value={person.nivel_ingresos} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Social */}
        <TabsContent value="social">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Heart className="h-4 w-4" /> Información social
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {person.necesidades_principales && (
                <div>
                  <p className="text-xs text-muted-foreground">Necesidades principales</p>
                  <p className="text-sm">{person.necesidades_principales}</p>
                </div>
              )}
              {person.restricciones_alimentarias && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground">Restricciones alimentarias</p>
                    <p className="text-sm">{person.restricciones_alimentarias}</p>
                  </div>
                </>
              )}
              {person.observaciones && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground">Observaciones</p>
                    <p className="text-sm">{person.observaciones}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Consent modal */}
      <ConsentModal
        open={showConsent}
        personId={person.id}
        templates={templates}
        onClose={() => setShowConsent(false)}
        onSaved={() => {
          setShowConsent(false);
          onRefresh?.();
        }}
      />
    </div>
  );
}
