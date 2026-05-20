import type { MemberDeliveryRow, DeliveryRoundHeader } from "./documentService.types";

type FamilyInput = {
  familia_numero: number;
  titular_nombre: string;
  titular_apellidos: string;
  titular_documento: string;
  titular_telefono: string;
  num_adultos: number;
  num_menores_18: number;
  fecha: string;
};

type Rates = Pick<
  DeliveryRoundHeader,
  | "per_member_rate_fyh"
  | "per_member_rate_carne"
  | "per_member_rate_infantil"
  | "per_member_rate_unidades"
>;

export function computeDeliveryRow(family: FamilyInput, rates: Rates): MemberDeliveryRow {
  if (rates.per_member_rate_fyh < 0)
    throw new Error("per_member_rate_fyh must be non-negative");
  if (rates.per_member_rate_carne < 0)
    throw new Error("per_member_rate_carne must be non-negative");
  if (rates.per_member_rate_infantil < 0)
    throw new Error("per_member_rate_infantil must be non-negative");
  if (rates.per_member_rate_unidades < 0)
    throw new Error("per_member_rate_unidades must be non-negative");

  const total_miembros = family.num_adultos + family.num_menores_18;

  return {
    numero_expediente: String(family.familia_numero).padStart(4, "0"),
    nombre: family.titular_nombre,
    apellidos: family.titular_apellidos,
    documento: family.titular_documento,
    telefono: family.titular_telefono,
    num_adultos: family.num_adultos,
    num_menores_18: family.num_menores_18,
    total_miembros,
    kg_frutas_hortalizas: rates.per_member_rate_fyh * total_miembros,
    kg_carne: rates.per_member_rate_carne * total_miembros,
    kg_infantil: rates.per_member_rate_infantil * family.num_menores_18,
    unidades_no_alimentacion: rates.per_member_rate_unidades * total_miembros,
    fecha: family.fecha,
  };
}
