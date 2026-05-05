import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type PersonCreate } from "../../../schemas";
import { FieldError } from "../_shared";

interface Step3ContactoProps {
  register: UseFormRegister<PersonCreate>;
  errors: FieldErrors<PersonCreate>;
}

export function Step3Contacto({ register, errors }: Step3ContactoProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="telefono">Teléfono</Label>
          <Input id="telefono" type="tel" {...register("telefono")} placeholder="+34 612 345 678" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} placeholder="correo@ejemplo.com" />
          <FieldError message={errors.email?.message} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="direccion">Dirección</Label>
        <Input id="direccion" {...register("direccion")} placeholder="Calle Mayor 1, 2ºA" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="municipio">Municipio</Label>
          <Input id="municipio" {...register("municipio")} placeholder="Madrid" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="barrio_zona">Barrio / Zona</Label>
          <Input id="barrio_zona" {...register("barrio_zona")} placeholder="Vallecas" />
        </div>
      </div>
    </div>
  );
}
